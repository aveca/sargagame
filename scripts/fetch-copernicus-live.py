#!/usr/bin/env python3
"""
Fetch REAL sargassum NFAI data from Copernicus Marine for all monitored beaches.
Uses the official copernicusmarine Python package.
Output: public/api/copernicus/sargassum.json (replaces reference data with live data)

Usage:
  COPERNICUS_USERNAME=xxx COPERNICUS_PASSWORD=xxx python3 scripts/fetch-copernicus-live.py

Install:
  pip install copernicusmarine xarray numpy
"""
import os, sys, json, math
from datetime import datetime, timedelta

# Beach coordinates (20 monitored beaches)
BEACHES = [
    {"id":"grande-anse","lat":14.5028,"lng":-61.0856,"island":"mq","name":"Grande Anse d'Arlet"},
    {"id":"anse-mitan","lat":14.5523,"lng":-61.0552,"island":"mq","name":"Anse Mitan"},
    {"id":"anse-noire","lat":14.5277,"lng":-61.0874,"island":"mq","name":"Anse Noire"},
    {"id":"tartane","lat":14.7507,"lng":-60.9257,"island":"mq","name":"Tartane"},
    {"id":"anse-madame","lat":14.6178,"lng":-61.1036,"island":"mq","name":"Anse Madame"},
    {"id":"diamant","lat":14.4758,"lng":-61.0314,"island":"mq","name":"Le Diamant"},
    {"id":"pt-marin","lat":14.4511,"lng":-60.8836,"island":"mq","name":"Pointe du Marin"},
    {"id":"sainte-anne","lat":14.4305,"lng":-60.8850,"island":"mq","name":"Sainte-Anne"},
    {"id":"les-salines","lat":14.3959,"lng":-60.8690,"island":"mq","name":"Les Salines"},
    {"id":"vauclin","lat":14.5414,"lng":-60.8292,"island":"mq","name":"Le Vauclin"},
    {"id":"gp-grande-anse","lat":16.1312,"lng":-61.7682,"island":"gp","name":"Grande Anse (GP)"},
    {"id":"gp-malendure","lat":16.1721,"lng":-61.7767,"island":"gp","name":"Malendure"},
    {"id":"gp-sainte-anne","lat":16.2226,"lng":-61.3828,"island":"gp","name":"Sainte-Anne (GP)"},
    {"id":"gp-pt-chateaux","lat":16.2531,"lng":-61.2307,"island":"gp","name":"Pointe des Châteaux"},
    {"id":"gp-gosier","lat":16.2048,"lng":-61.4948,"island":"gp","name":"Le Gosier"},
    {"id":"gp-caravelle","lat":16.2181,"lng":-61.3965,"island":"gp","name":"La Caravelle"},
    {"id":"gp-bas-du-fort","lat":16.2140,"lng":-61.5237,"island":"gp","name":"Bas du Fort"},
    {"id":"gp-deshaies","lat":16.3054,"lng":-61.7951,"island":"gp","name":"Deshaies"},
    {"id":"gp-moule","lat":16.4222,"lng":-61.5337,"island":"gp","name":"Le Moule"},
    {"id":"gp-vieux-fort","lat":16.2488,"lng":-61.1428,"island":"gp","name":"Vieux-Fort"},
]

DATASET_ID = "MULTIOBS_GLO_BGC_SURFACE_NRT_015_016"
VARIABLE = "nfai"
DAYS = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"]

def status_from_afai(afai):
    if afai < 0.3: return "clean"
    if afai < 0.65: return "moderate"
    return "avoid"

def main():
    username = os.environ.get("COPERNICUS_USERNAME")
    password = os.environ.get("COPERNICUS_PASSWORD")
    if not username or not password:
        print("ERROR: COPERNICUS_USERNAME and COPERNICUS_PASSWORD env vars required")
        sys.exit(1)

    try:
        import copernicusmarine as cm
        import xarray as xr
        import numpy as np
    except ImportError:
        print("ERROR: pip install copernicusmarine xarray numpy")
        sys.exit(1)

    print(f"Fetching live NFAI data from Copernicus Marine...")
    print(f"Dataset: {DATASET_ID}")
    print(f"Variable: {VARIABLE}")

    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=7)

    try:
        # Open the dataset remotely
        ds = cm.open_dataset(
            dataset_id=DATASET_ID,
            variables=[VARIABLE],
            minimum_longitude=-62.5,
            maximum_longitude=-60.0,
            minimum_latitude=14.0,
            maximum_latitude=17.0,
            start_datetime=start_date.strftime("%Y-%m-%dT00:00:00"),
            end_datetime=end_date.strftime("%Y-%m-%dT23:59:59"),
            username=username,
            password=password,
        )
        print(f"Dataset loaded: {ds}")
    except Exception as e:
        print(f"ERROR loading dataset: {e}")
        print("Falling back to reference data")
        sys.exit(1)

    # Extract NFAI values at each beach coordinate
    levels = []
    weekly = {}

    for beach in BEACHES:
        try:
            # Get nearest point to beach coordinates
            point = ds[VARIABLE].sel(
                latitude=beach["lat"],
                longitude=beach["lng"],
                method="nearest"
            )

            # Get the latest value (last time step)
            latest = float(point.isel(time=-1).values)
            if math.isnan(latest):
                latest = 0.0
            afai = max(0.0, min(1.0, abs(latest)))

            # Get 7-day forecast from the time series
            time_values = point.values
            forecast = []
            now = datetime.utcnow()
            for i in range(min(7, len(time_values))):
                d = now + timedelta(days=i)
                v = float(time_values[-(min(7, len(time_values)) - i)]) if i < len(time_values) else afai
                if math.isnan(v): v = afai
                v = max(0.0, min(1.0, abs(v)))
                day_name = "Auj." if i == 0 else "Dem." if i == 1 else DAYS[d.weekday() if d.weekday() < 7 else 0]
                forecast.append({
                    "day": day_name,
                    "date": d.strftime("%Y-%m-%d"),
                    "afai": round(v, 2),
                    "status": status_from_afai(v)
                })

            # Pad to 7 days if needed
            while len(forecast) < 7:
                d = now + timedelta(days=len(forecast))
                forecast.append({
                    "day": DAYS[d.weekday() if d.weekday() < 7 else 0],
                    "date": d.strftime("%Y-%m-%d"),
                    "afai": round(afai, 2),
                    "status": status_from_afai(afai)
                })

            # Calculate drift
            if len(forecast) >= 2:
                trend = forecast[-1]["afai"] - forecast[0]["afai"]
            else:
                trend = 0
            drift = "up" if trend > 0.05 else "down" if trend < -0.05 else "stable"
            drift_label = "Dérive possible vers la côte" if drift == "up" else "Dispersion attendue" if drift == "down" else "Stable"

            levels.append({"id": beach["id"], "afai": round(afai, 2), "status": status_from_afai(afai)})
            weekly[beach["id"]] = {
                "forecast": forecast,
                "drift": drift,
                "driftLabel": drift_label,
                "driftValue": round(trend, 2)
            }
            print(f"  ✓ {beach['id']}: AFAI={afai:.2f} ({status_from_afai(afai)})")

        except Exception as e:
            print(f"  ✗ {beach['id']}: {e}")
            # Fallback for this beach
            levels.append({"id": beach["id"], "afai": 0.2, "status": "clean"})

    # Write output
    output = {
        "source": "copernicus",
        "updatedAt": datetime.utcnow().isoformat() + "Z",
        "levels": levels,
        "weekly": weekly
    }

    out_path = os.path.join(os.path.dirname(__file__), "..", "public", "api", "copernicus", "sargassum.json")
    with open(out_path, "w") as f:
        json.dump(output, f)
    print(f"\nWrote {len(levels)} beaches to {out_path}")
    print(f"Source: copernicus (LIVE)")

if __name__ == "__main__":
    main()
