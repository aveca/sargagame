# Sargass DNS Audit Report - 6 Zones

## Zone Mapping
- **MQ** = sargasses-martinique.com
- **GP** = sargasses-guadeloupe.com  
- **FL** = sargassummiami.com (Florida)
- **PC** = sargassumpuntacana.com (Puntacana)
- **RM** = sargassumcancun.com (Riviera Maya)
- **Tulum** = sargazotulum.com

---

## 1. Complete Records Table Per Zone

### sargasses-martinique.com (MQ)
```
Type    Name                                    Content                        Proxied   TTL
A       autoconfig.sargasses-martinique.com     162.0.229.47                     true      1
A       autodiscover.sargasses-martinique.com   162.0.229.47                     true      1
A       cpanel.sargasses-martinique.com         162.0.229.47                     true      1
A       cpcalendars.sargasses-martinique.com    162.0.229.47                     true      1
A       cpcontacts.sargasses-martinique.com     162.0.229.47                     true      1
A       email.sargasses-martinique.com          162.0.229.44                     false     1
A       mail.sargasses-martinique.com           162.0.229.44                     false     1
A       webdisk.sargasses-martinique.com        162.0.229.47                     true      1
A       webmail.sargasses-martinique.com        162.0.229.47                     true      1
A       whm.sargasses-martinique.com            162.0.229.47                     true      1
CNAME   ftp.sargasses-martinique.com            sargasses-martinique.com         true      1
CNAME   sargasses-martinique.com                sargagame.pages.dev              true      1
CNAME   www.sargasses-martinique.com            sargasses-martinique.com         true      1
MX      pro.sargasses-martinique.com            inbound-smtp.us-east-1.amazonaws.com    false    1
MX      sargasses-martinique.com                amir.mx.cloudflare.net             false    1
MX      sargasses-martinique.com                linda.mx.cloudflare.net            false    1
MX      sargasses-martinique.com                isaac.mx.cloudflare.net            false    1
MX      send.pro.sargasses-martinique.com       feedback-smtp.us-east-1.amazonses.com  false    3600
MX      send.sargasses-martinique.com           feedback-smtp.us-east-1.amazonses.com     false    1
SRV     _autodiscover._tcp.sargasses-martinique.com 0 443 cpanelemaildiscovery.cpanel.net  false    1
SRV     _caldavs._tcp.sargasses-martinique.com    0 2080 sargasses-martinique.com         false    1
SRV     _caldav._tcp.sargasses-martinique.com     0 2079 sargasses-martinique.com           false    1
SRV     _carddavs._tcp.sargasses-martinique.com   0 2080 sargasses-martinique.com          false    1
SRV     _carddav._tcp.sargasses-martinique.com    0 2079 sargasses-martinique.com           false    1
TXT     _caldavs._tcp.sargasses-martinique.com    "path=/"                           false     1
TXT     _caldav._tcp.sargasses-martinique.com     "path=/"                           false     1
TXT     _carddavs._tcp.sargasses-martinique.com   "path=/"                           false     1
TXT     _carddav._tcp.sargasses-martinique.com    "path=/"                           false     1
TXT     _default_key.sargasses-martinique.com   DKIM v=DKIM1; k=rsa; p=...          false     1
TXT     _dmarc.pro.sargasses-martinique.com     v=DMARC1; p=none; rua=mailto:...      false     1
TXT     _dmarc.sargasses-martinique.com         v=DMARC1; p=quarantine; rua=mailto:...  false    1
TXT     resend._domainkey.pro.sargasses-martinique.com  p=...                          false     3600
TXT     resend._domainkey.sargasses-martinique.com    p=...                            false     1
TXT     sargasses-martinique.com                google-site-verification=...       false     1
TXT     sargasses-martinique.com                v=spf1 +a +mx +ip4:162.0.229.43 include:spf.web-hosting.com ~all  false    1
TXT     send.pro.sargasses-martinique.com       v=spf1 include:amazonses.com ~all      false     3600
TXT     send.sargasses-martinique.com           v=spf1 include:amazonses.com ~all        false     1
AAAA    api.sargasses-martinique.com            100::                              true      1
```

### sargasses-guadeloupe.com (GP)
```
Type    Name                                    Content                        Proxied   TTL
A       www.sargasses-guadeloupe.com            162.0.229.47                     true      1
CNAME   sargasses-guadeloupe.com                sargagame-gp.pages.dev           true      1
MX      sargasses-guadeloupe.com                amir.mx.cloudflare.net             false    1
MX      sargasses-guadeloupe.com                linda.mx.cloudflare.net            false    1
MX      sargasses-guadeloupe.com                isaac.mx.cloudflare.net            false    1
TXT     _dmarc.sargasses-guadeloupe.com         v=DMARC1; p=quarantine; rua=mailto:...  false    1
TXT     sargasses-guadeloupe.com                v=spf1 include:_spf.mx.cloudflare.net ~all  false    60
TXT     sargasses-guadeloupe.com                google-site-verification=A37z7Yvm_...     false    60
AAAA    api.sargasses-guadeloupe.com            100::                              true      1
```

### sargassumcancun.com (RM)
```
Type    Name                                    Content                        Proxied   TTL
AAAA    api.sargassumcancun.com                 100::                              true      1
CNAME   sargassumcancun.com                     sargagame-rivieramaya.pages.dev    true      1
CNAME   www.sargassumcancun.com                 sargassumcancun.com              true      1
MX      sargassumcancun.com                     amir.mx.cloudflare.net             false    1
MX      sargassumcancun.com                     linda.mx.cloudflare.net            false    1
MX      sargassumcancun.com                     isaac.mx.cloudflare.net            false    1
TXT     _dmarc.sargassumcancun.com              v=DMARC1; p=quarantine; rua=mailto:...  false    1
TXT     sargassumcancun.com                     v=spf1 include:_spf.mx.cloudflare.net ~all  false    1
```

### sargassummiami.com (FL)
```
Type    Name                                    Content                        Proxied   TTL
AAAA    api.sargassummiami.com                  100::                              true      1
CNAME   sargassummiami.com                      sargagame-florida.pages.dev      true      1
CNAME   www.sargassummiami.com                  sargassummiami.com               true      1
MX      sargassummiami.com                      amir.mx.cloudflare.net             false    1
MX      sargassummiami.com                      linda.mx.cloudflare.net            false    1
MX      sargassummiami.com                      isaac.mx.cloudflare.net            false    1
TXT     _dmarc.sargassummiami.com               v=DMARC1; p=quarantine; rua=mailto:...  false    1
TXT     sargassummiami.com                      v=spf1 include:_spf.mx.cloudflare.net ~all  false    1
```

### sargassumpuntacana.com (PC)
```
Type    Name                                    Content                        Proxied   TTL
AAAA    api.sargassumpuntacana.com              100::                              true      1
CNAME   sargassumpuntacana.com                  sargagame-puntacana.pages.dev      true      1
CNAME   www.sargassumpuntacana.com              sargassumpuntacana.com           true      1
MX      sargassumpuntacana.com                  amir.mx.cloudflare.net             false    1
MX      sargassumpuntacana.com                  linda.mx.cloudflare.net            false    1
MX      sargassumpuntacana.com                  isaac.mx.cloudflare.net            false    1
TXT     _dmarc.sargassumpuntacana.com           v=DMARC1; p=quarantine; rua=mailto:...  false    1
TXT     sargassumpuntacana.com                  v=spf1 include:_spf.mx.cloudflare.net ~all  false    1
```

### sargazotulum.com (Tulum)
```
Type    Name                                    Content                        Proxied   TTL
AAAA    api.sargazotulum.com                    100::                              true      1
CNAME   sargazotulum.com                        sargagame-tulum.pages.dev          true      1
CNAME   www.sargazotulum.com                    sargazotulum.com                 true      1
MX      sargazotulum.com                        amir.mx.cloudflare.net             false    1
MX      sargazotulum.com                        linda.mx.cloudflare.net            false    1
MX      sargazotulum.com                        isaac.mx.cloudflare.net            false    1
TXT     _dmarc.sargazotulum.com                 v=DMARC1; p=quarantine; rua=mailto:...  false    1
TXT     sargazotulum.com                      v=spf1 include:_spf.mx.cloudflare.net ~all  false    1
```

---

## 2. Inter-Zones Comparative Table

| Record Type                      | MQ | GP | FL | PC | RM | Tulum |
|----------------------------------|----|----|----|----|----|-------|
| CNAME www → apex/zone            | →zone | A record | →apex | →apex | →apex | →apex |
| Apex via CNAME flattening → pages.dev | YES | YES | YES | YES | YES | YES |
| MX records present               | 5  | 3  | 3  | 3  | 3  | 3     |
| SPF present (no +all)            | ~all | ~all | ~all | ~all | ~all | ~all |
| DMARC present (p=quarantine+rua) | YES* | YES | YES | YES | YES | YES |
| DKIM record present              | YES | NO | NO | NO | NO | NO |
| CAA records present              | NO | NO | NO | NO | NO | NO |
| Proxied www CNAME                | YES | A record | YES | YES | YES | YES |
| Proxied apex/CNAME               | YES | YES (flattening) | YES | YES | YES | YES |

*\* MQ has duplicate _dmarc records (see issues below)*

### Gaps Identified
- **DKIM records** missing in 5/6 zones (only MQ has `_default_key` TXT)
- **CAA records** missing in all 6 zones (recommended: `issue "letsencrypt.org"`, `issue "digicert.com"`)
- **MQ has duplicate _dmarc records**: `_dmarc.pro` (p=none) and `_dmarc` (p=quarantine) at apex
- **MQ has duplicate _domainkey records**: `resend._domainkey.pro` and `resend._domainkey`
- **GP zone** has www as A record instead of CNAME to apex (mixed configuration)
- **No zones have `_acme-challenge` TXT records** for Let's Encrypt validation

---

## 3. Records to Add/Modify/Remove Per Zone

### sargasses-martinique.com (MQ) - HIGH PRIORITY

**ADD:**
- CAA TXT records: `issue "letsencrypt.org"`, `issue "digicert.com"`
- `_acme-challenge` TXT record for Let's Encrypt validation

**MODIFY:**
- **Consolidate duplicate _dmarc records**: Keep `_dmarc.sargasses-martinique.com` (p=quarantine, rua=mailto:alerte@...), remove `_dmarc.pro.sargasses-martinique.com` (p=none)
- **Consolidate duplicate _domainkey records**: Keep one `resend._domainkey` record, remove the `pro` variant
- Consider changing `www.sargasses-martinique.com` CNAME from `sargasses-martinique.com` to `sargagame.pages.dev` directly

**REMOVE (orphan risk evaluation):**
- `autoconfig.sargasses-martinique.com`, `autodiscover.sargasses-martinique.com`, `cpanel.sargasses-martinique.com`, `cpcalendars.sargasses-martinique.com`, `cpcontacts.sargasses-martinique.com` - these point to 162.0.229.47 and may be orphaned if not used for Microsoft 365/Google Workspace
- `_caldavs._tcp`, `_caldav._tcp`, `_carddavs._tcp`, `_carddav._tcp` SRV/TXT records - if CalDAV/CardDAV not used

### sargasses-guadeloupe.com (GP) - MEDIUM PRIORITY

**ADD:**
- CAA TXT records: `issue "letsencrypt.org"`, `issue "digicert.com"`
- `_acme-challenge` TXT record
- DKIM TXT record (`_defaultkey.sargasses-guadeloupe.com` similar to MQ)

**MODIFY:**
- Consider changing `www.sargasses-guadeloupe.com` from A record to CNAME `sargagame-gp.pages.dev` for consistency with other zones
- Ensure SPF records aren't duplicated (currently one at zone level, check if `send.pro`/`send` records exist elsewhere)

### sargassumcancun.com (RM) - MEDIUM PRIORITY

**ADD:**
- CAA TXT records
- `_acme-challenge` TXT record
- DKIM TXT record

### sargassummiami.com (FL) - MEDIUM PRIORITY

**ADD:**
- CAA TXT records
- `_acme-challenge` TXT record
- DKIM TXT record

### sargassumpuntacana.com (PC) - MEDIUM PRIORITY

**ADD:**
- CAA TXT records
- `_acme-challenge` TXT record
- DKIM TXT record

### sargazotulum.com (Tulum) - MEDIUM PRIORITY

**ADD:**
- CAA TXT records
- `_acme-challenge` TXT record
- DKIM TXT record

---

## 4. DNSSEC Status

| Zone | Status | DS Records Needed |
|------|--------|-------------------|
| MQ (sargasses-martinique.com) | **DISABLED** | Yes - activate and add at registrar |
| GP (sargasses-guadeloupe.com) | **DISABLED** | Yes |
| FL (sargassummiami.com) | **DISABLED** | Yes |
| PC (sargassumpuntacana.com) | **DISABLED** | Yes |
| RM (sargassumcancun.com) | **DISABLED** | Yes |
| Tulum (sargazotulum.com) | **DISABLED** | Yes |

**All 6 zones have DNSSEC disabled.** Free plan supports DNSSEC activation. Upon activation, Cloudflare will generate DS records that must be added at the domain registrar (GoDaddy, Namecheap, etc.) for each zone.

---

## 5. DNS Security Score (/10 Per Zone)

### Scoring Criteria:
1. CNAME www → proper target: 1pt
2. Apex A record via CNAME flattening: 1pt
3. MX records present: 1pt
4. SPF record (no +all): 1pt
5. DMARC record (p=quarantine+rua): 1pt
6. DKIM record present: 1pt
7. CAA records present: 1pt
8. No duplicate critical records: 1pt
9. No critical orphans: 1pt
10. DNSSEC enabled: 1pt (bonus; all currently disabled)

### Scores

| Zone | Score | Notes |
|------|-------|-------|
| **MQ (sargasses-martinique.com)** | **6/10** | +1 CNAME www to apex (partial), +1 apex flattening, +1 MX, +1 SPF (~all), +1 DMARC (p=quarantine but duplicate), +1 DKIM (_default_key), -1 CAA absent, -0.5 duplicate _dmarc/_domainkey, +1 no orphans, -1 DNSSEC disabled |
| **GP (sargasses-guadeloupe.com)** | **6.5/10** | +1 apex flattening, +1 MX, +1 SPF, +1 DMARC, -0.5 DKIM absent (bonus), -0.5 CAA absent (bonus), +1 www A record proxied (acceptable), +1 no duplicates, +1 no orphans, -1 DNSSEC disabled |
| **FL (sargassummiami.com)** | **6/10** | +1 apex flattening, +1 MX, +1 SPF, +1 DMARC, -1 DKIM absent, -1 CAA absent, +1 www CNAME proxied, +1 no duplicates, +1 no orphans, -1 DNSSEC disabled |
| **PC (sargassumpuntacana.com)** | **6/10** | Same pattern as FL |
| **RM (sargassumcancun.com)** | **6/10** | Same pattern as FL |
| **Tulum (sargazotulum.com)** | **6/10** | Same pattern as FL |

---

## 6. Recommendations Summary

### HIGH PRIORITY (Immediate Action)
1. **Consolidate duplicate _dmarc records** in MQ zone - keep `_dmarc.sargasses-martinique.com` (p=quarantine), remove `_dmarc.pro.sargasses-martinique.com` (p=none)
2. **Add DKIM records** to 5 zones missing them (GP, FL, PC, RM, Tulum) - create `_defaultkey` TXT records with public key
3. **Add CAA records** to all 6 zones - `issue "letsencrypt.org"`, `issue "digicert.com"`
4. **Add _acme-challenge TXT records** to all 6 zones for Let's Encrypt validation
5. **Activate DNSSEC** on all zones (Free plan supported) - generate DS records at Cloudflare, add at registrar

### MEDIUM PRIORITY
1. Change GP zone www from A record to CNAME to `sargagame-gp.pages.dev` for consistency
2. Remove duplicate `_domainkey` records in MQ zone (keep one `resend._domainkey`)
3. Evaluate necessity of orphan subdomains in MQ (autoconfig, autodiscover, cpanel, etc.)
4. Standardize SPF records across all zones (currently consistent at ~all - good)

### LOW PRIORITY
1. Add monitoring for DNS record changes
2. Implement automated DNSSEC key rotation if activated
3. Review and potentially reduce internal A records (autoconfig, autodiscover, etc.)
4. Consider adding TXT `v=spf1 -all` or adjusting SPF policies based on actual email flow