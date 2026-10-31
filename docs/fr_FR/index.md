# Documentation Plugin Jeedom `airfree` (API Locale Port 3000)

Ce plugin permet d'intégrer et de piloter localement les systèmes **Airfree** (Webserver Cloud / Wi-Fi / Ethernet avec API locale sur le port `3000`) dans **Jeedom** (Desktop, Dashboard & Mobile), en reprenant l'ensemble des commandes du composant officiel **Home Assistant `airfree` (`aioairfree`)** ainsi que l'ergonomie visuelle **Airfree Cloud**.

---

## 1. Commandes de l'API Locale Airfree supportées

Conformément à l'implémentation [`homeassistant/components/airfree`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/airfree) :

### Lecture d'état (`POST http://<ip>:3000/api/v1/hvac`)
- Payload : `{"systemID": 1, "zoneID": 0}` et `{"systemID": 3, "zoneID": 0}` (avec fallback automatique lorsque `systemID: 0` renvoie `{"errors":[{"error":"systemid out of range"}]}`).
- Données récupérées pour chaque zone :
  - `on` (`0` / `1`) : État Marche / Arrêt de la zone
  - `roomTemp` (`°C`) : Température ambiante mesurée
  - `setpoint` (`°C`) : Température de consigne cible
  - `minTemp` / `maxTemp` (`°C`) : Plage de consigne autorisée par la zone (`15°C` à `27°C` / `30°C`)
  - `humidity` (`%`) : Taux d'humidité relative
  - `mode` (`int`) : Mode CVC actif (`1`=Arrêt, `2`=Refroidissement, `3`=Chauffage, `4`=Ventilation, `5`=Déshumidification, `7`=Auto)
  - `modes` (`array`) : Liste des modes supportés (présent sur le thermostat Maître du groupe)
  - `air_demand` (`0` / `1`) : Demande d'air active (ouverture registre)
  - `floor_demand` (`0` / `1`) : Demande plancher chauffant/rafraîchissant active
  - `coldStage` / `heatStage` : Étapes de régulation froid / chaud
  - `sleep` (`min`) : Minuterie de mise en veille (`0`, `30`, `60`, `90`)
  - `errors` (`array`) : Codes d'erreur éventuels

### Pilotage (`PUT http://<ip>:3000/api/v1/hvac`)
- **Allumer / Éteindre une zone** : `{"systemID": 1, "zoneID": 1, "on": 1}`
- **Modifier la consigne (pas de 0.5°C)** : `{"systemID": 1, "zoneID": 1, "setpoint": 22.5}`
- **Changer le mode du système/groupe** : `{"systemID": 1, "zoneID": 1, "mode": 3}`
- **Régler la minuterie Sleep** : `{"systemID": 1, "zoneID": 1, "sleep": 30}`

---

## 2. Architecture du Plugin Jeedom

```
airfree/
├── plugin_info/
│   ├── info.json            # Déclaration du plugin Jeedom (id: airfree)
│   ├── install.php          # Cron 5 min (airfree::pull) & configuration par défaut
│   ├── configuration.php    # Configuration IP, Port (3000), Systèmes (1,3), Test & Sync
│   └── airfree_icon.svg     # Icône du plugin
├── core/
│   ├── class/
│   │   └── airfree.class.php # Classes eqLogic (airfree) et cmd (airfreeCmd)
│   ├── ajax/
│   │   └── airfree.ajax.php  # Contrôleur AJAX Jeedom
│   ├── php/
│   │   └── airfree.inc.php
│   └── template/
│       ├── dashboard/eqLogic.html # Tuile Widget Dashboard style Airfree Cloud
│       └── mobile/eqLogic.html    # Tuile Widget Mobile style Airfree Cloud
├── desktop/
│   ├── php/
│   │   ├── airfree.php      # Page d'administration & d'édition des équipements
│   │   └── panel.php        # Panel Desktop complet Airfree Cloud
│   ├── js/
│   │   └── airfree.js       # Logique interactive Desktop & Mobile
│   └── css/
│       └── airfree.css      # Design Airfree Cloud responsive
├── mobile/
│   ├── html/
│   │   └── airfree.html     # Vue Mobile WebApp Jeedom
│   └── js/
│       └── airfree.js
├── index.html               # Interface Web & Mobile autonome (test direct sans Jeedom)
├── api.php                  # Passerelle PHP locale directe vers 192.168.0.61:3000
└── start_server.cmd         # Lanceur rapide serveur local (port 8088)
```

---

## 3. Installation dans Jeedom

1. Copier le dossier `airfree` dans `/var/www/html/plugins/airfree` sur votre box Jeedom.
2. Dans Jeedom, aller dans **Plugins → Gestion des plugins → Airfree Local API** et activer le plugin.
3. Renseigner l'adresse IP (`192.168.0.61`), le port (`3000`) et les systèmes (`1,3`), puis cliquer sur **Découvrir & Synchroniser les zones**.
4. Activer l'affichage du panneau Desktop et Mobile pour profiter de l'interface complète inspirée d'Airfree Cloud.
