import math

class SargassumPhysicsEngine:
    """
    Moteur de simulation advection-diffusion pour la dérive des sargasses
    (Serious Game : Sargagame).
    Basé sur l'équation d'advection-diffusion et la cinétique chimique de H2S.
    """
    
    def __init__(self, initial_budget=36000000):
        # Paramètres de simulation
        self.k_wind = 0.03  # Facteur de dérive éolienne (1-3% de la vitesse du vent)
        self.d_turb = 1.5   # Coefficient de diffusion turbulente
        
        # État du Jeu
        self.budget = initial_budget
        self.h2s_global_level = 0.0
        self.tourist_attractiveness = 100.0
        
    def compute_drift(self, sargassum_density, water_current, wind_vector):
        """
        Calcule la nouvelle position des nappes d'algues.
        U_total = U_courant + k * U_vent
        """
        drift_x = water_current[0] + self.k_wind * wind_vector[0]
        drift_y = water_current[1] + self.k_wind * wind_vector[1]
        
        # Application simple du déplacement (Euler)
        new_density = sargassum_density * 1.05 # Croissance biologique (nutriments)
        return new_density, (drift_x, drift_y)
        
    def compute_h2s_emission(self, stranded_volume, temperature, humidity):
        """
        Calcule la concentration de gaz toxique H2S relâché par les algues en putréfaction.
        La toxicité fait baisser l'attractivité touristique.
        """
        desiccation_rate = 0.02 * temperature * (100 - humidity) / 100.0
        emission = stranded_volume * desiccation_rate
        
        self.h2s_global_level += emission
        self.tourist_attractiveness -= emission * 0.1
        
        # Plancher
        if self.tourist_attractiveness < 0:
            self.tourist_attractiveness = 0
            
        return emission

    def deploy_countermeasure(self, action_type):
        """
        Déploie une protection physique (coût sur le budget).
        """
        costs = {
            "barrage": 150000,
            "navire": 500000,
            "engins": 80000,
            "brigade": 20000
        }
        cost = costs.get(action_type, 0)
        
        if self.budget >= cost:
            self.budget -= cost
            return True, self.budget
        return False, self.budget

if __name__ == "__main__":
    engine = SargassumPhysicsEngine()
    print("Moteur Physique Sargagame (Python) Initialisé.")
    print(f"Budget: {engine.budget}€")
