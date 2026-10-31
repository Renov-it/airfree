<?php
/* This file is part of Jeedom.
 *
 * Plugin Airfree Local API (basé sur les spécifications Home Assistant core/components/airfree & aioairfree)
 */

require_once dirname(__FILE__) . '/../../../../core/php/core.inc.php';

class airfree extends eqLogic {

    const MODE_STOP = 1;
    const MODE_COOLING = 2;
    const MODE_HEATING = 3;
    const MODE_FAN = 4;
    const MODE_DRY = 5;
    const MODE_AUTO = 7;

    public static $_widgetPossibility = array('custom' => true);

    public static function getModeLabels() {
        return array(
            self::MODE_STOP    => __('Arrêt', __FILE__),
            self::MODE_COOLING => __('Refroidissement', __FILE__),
            self::MODE_HEATING => __('Chauffage', __FILE__),
            self::MODE_FAN     => __('Ventilation', __FILE__),
            self::MODE_DRY     => __('Déshumidification', __FILE__),
            self::MODE_AUTO    => __('Auto', __FILE__)
        );
    }

    /**
     * Cron toutes les 5 minutes : rafraîchissement global
     */
    public static function pull() {
        try {
            self::refreshAllZones();
        } catch (Exception $e) {
            log::add('airfree', 'error', 'Erreur cron pull : ' . $e->getMessage());
        }
    }

    /**
     * Requête bas niveau vers l'API locale Airfree (port 3000)
     * POST /api/v1/hvac -> lecture d'état
     * PUT  /api/v1/hvac -> modification de paramètre (on, setpoint, mode, sleep, speed, name...)
     */
    public static function requestApi($endpoint = '/api/v1/hvac', $payload = array(), $method = 'POST', $ip = null, $port = null) {
        $allowedEndpoints = array('/api/v1/hvac', '/api/v1/webserver', '/api/v1/version', '/api/v1/integration');
        if (!in_array($endpoint, $allowedEndpoints, true)) {
            throw new Exception('Endpoint API non autorisé : ' . $endpoint);
        }
        if ($ip === null || trim($ip) === '') {
            $ip = config::byKey('airfree_ip', 'airfree', '192.168.0.61');
        }
        if ($port === null || trim($port) === '') {
            $port = config::byKey('airfree_port', 'airfree', '3000');
        }
        $ip = trim($ip);
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) || !preg_match('/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/', $ip)) {
            throw new Exception('Adresse IP locale RFC1918 invalide : ' . $ip);
        }
        $port = intval($port);
        if ($port < 80 || $port > 65535) {
            throw new Exception('Port TCP invalide : ' . $port);
        }

        $url = 'http://' . $ip . ':' . $port . $endpoint;
        $jsonBody = empty($payload) ? '{}' : json_encode($payload, JSON_UNESCAPED_UNICODE);

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
        curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonBody);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array(
            'Content-Type: application/json',
            'Content-Length: ' . strlen($jsonBody)
        ));

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr  = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            throw new Exception('Impossible de joindre le Webserver Airfree (' . $url . ') : ' . $curlErr);
        }

        $decoded = json_decode($response, true);
        if (!is_array($decoded)) {
            throw new Exception('Réponse JSON invalide depuis ' . $url . ' (HTTP ' . $httpCode . ')');
        }

        return $decoded;
    }

    /**
     * Récupère toutes les zones de tous les systèmes (Groupes) Airfree.
     * Gère automatiquement le cas où systemID=0 renvoie "systemid out of range" (fréquent sur Webserver Airfree).
     */
    public static function fetchAllSystems($ip = null, $port = null, $systemsCsv = null, $autoScan = false) {
        if ($ip === null || trim($ip) === '') {
            $ip = config::byKey('airfree_ip', 'airfree', '192.168.0.61');
        }
        if ($port === null || trim($port) === '') {
            $port = config::byKey('airfree_port', 'airfree', '3000');
        }
        if ($systemsCsv === null || trim($systemsCsv) === '') {
            $systemsCsv = config::byKey('airfree_systems', 'airfree', '1,3');
        }

        $zones = array();
        $systemsMap = array();

        // 1. Essai broadcast systemID: 0, zoneID: 0 (comportement initial aioairfree)
        $broadcastRes = self::requestApi('/api/v1/hvac', array('systemID' => 0, 'zoneID' => 0), 'POST', $ip, $port);
        if (isset($broadcastRes['data']) && is_array($broadcastRes['data']) && count($broadcastRes['data']) > 0) {
            foreach ($broadcastRes['data'] as $z) {
                $zones[] = self::normalizeZone($z);
            }
        } elseif (isset($broadcastRes['systems']) && is_array($broadcastRes['systems'])) {
            foreach ($broadcastRes['systems'] as $sys) {
                if (isset($sys['data']) && is_array($sys['data'])) {
                    foreach ($sys['data'] as $z) {
                        $zones[] = self::normalizeZone($z);
                    }
                }
            }
        } else {
            // 2. Fallback sur la liste des systemIDs configurés ou scan 1..8
            $sysIds = array();
            if ($autoScan) {
                $sysIds = range(1, 8);
            } else {
                foreach (explode(',', $systemsCsv) as $part) {
                    $id = intval(trim($part));
                    if ($id > 0 && $id <= 32) {
                        $sysIds[] = $id;
                    }
                }
                if (empty($sysIds)) {
                    $sysIds = array(1, 2, 3);
                }
            }

            foreach ($sysIds as $sysId) {
                $res = self::requestApi('/api/v1/hvac', array('systemID' => intval($sysId), 'zoneID' => 0), 'POST', $ip, $port);
                if (isset($res['data']) && is_array($res['data']) && count($res['data']) > 0) {
                    foreach ($res['data'] as $z) {
                        $zones[] = self::normalizeZone($z);
                    }
                }
            }
        }

        // Regroupement par systemID (Groupe 1, Groupe 2...)
        $groupIndex = 1;
        foreach ($zones as $z) {
            $sysId = $z['systemID'];
            if (!isset($systemsMap[$sysId])) {
                $systemsMap[$sysId] = array(
                    'systemID'    => $sysId,
                    'groupNumber' => $groupIndex,
                    'groupName'   => 'Groupe ' . $groupIndex,
                    'mode'        => $z['mode'],
                    'modes'       => $z['modes'],
                    'masterZoneID'=> $z['zoneID'],
                    'anyOn'       => false,
                    'allOn'       => true,
                    'zones'       => array()
                );
                $groupIndex++;
            }
            if (!empty($z['modes'])) {
                $systemsMap[$sysId]['modes'] = $z['modes'];
                $systemsMap[$sysId]['masterZoneID'] = $z['zoneID'];
            }
            if ($z['available']) {
                if ($z['on'] == 1) {
                    $systemsMap[$sysId]['anyOn'] = true;
                } else {
                    $systemsMap[$sysId]['allOn'] = false;
                }
            }
            $systemsMap[$sysId]['zones'][] = $z;
        }

        return array(
            'ip'            => $ip,
            'port'          => intval($port),
            'installName'   => config::byKey('airfree_install_name', 'airfree', 'Bureaux'),
            'installLoc'    => config::byKey('airfree_install_location', 'airfree', 'Montpellier, Hérault'),
            'timestamp'     => date('Y-m-d H:i:s'),
            'systems'       => array_values($systemsMap),
            'zones'         => $zones
        );
    }

    /**
     * Normalise les données d'une zone selon le modèle Home Assistant (aioairfree)
     */
    public static function normalizeZone($raw) {
        $sysId    = isset($raw['systemID']) ? intval($raw['systemID']) : 1;
        $zoneId   = isset($raw['zoneID']) ? intval($raw['zoneID']) : 1;
        $name     = isset($raw['name']) ? trim($raw['name']) : ('Zone ' . $zoneId);
        $roomTemp = isset($raw['roomTemp']) ? round(floatval($raw['roomTemp']), 1) : 0.0;
        $setpoint = isset($raw['setpoint']) ? round(floatval($raw['setpoint']), 1) : 21.0;
        $humidity = isset($raw['humidity']) ? intval($raw['humidity']) : 0;
        $on       = isset($raw['on']) ? intval($raw['on']) : 0;
        $mode     = isset($raw['mode']) ? intval($raw['mode']) : self::MODE_HEATING;
        $modes    = (isset($raw['modes']) && is_array($raw['modes'])) ? $raw['modes'] : array();
        $minTemp  = isset($raw['minTemp']) ? floatval($raw['minTemp']) : 15.0;
        $maxTemp  = isset($raw['maxTemp']) ? floatval($raw['maxTemp']) : 30.0;

        // Une zone avec roomTemp == 0 et humidity == 0 correspond à une zone non connectée / non disponible
        $available = !($roomTemp <= 0.0 && $humidity <= 0);
        $isHidden  = (bool)preg_match('/^(ZONA|ZONE)\s*\d+$/i', $name) && !$available;
        $isMaster  = !empty($modes);

        $modeLabels = self::getModeLabels();
        $modeLabel  = isset($modeLabels[$mode]) ? $modeLabels[$mode] : 'Inconnu (' . $mode . ')';

        return array(
            'logicalId'    => 'sys_' . $sysId . '_zone_' . $zoneId,
            'systemID'     => $sysId,
            'zoneID'       => $zoneId,
            'name'         => $name,
            'on'           => $on,
            'available'    => $available ? 1 : 0,
            'hidden'       => $isHidden ? 1 : 0,
            'isMaster'     => $isMaster ? 1 : 0,
            'roomTemp'     => $roomTemp,
            'setpoint'     => $setpoint,
            'minTemp'      => $minTemp,
            'maxTemp'      => $maxTemp,
            'humidity'     => $humidity,
            'mode'         => $mode,
            'modeLabel'    => $modeLabel,
            'modes'        => $modes,
            'air_demand'   => isset($raw['air_demand']) ? intval($raw['air_demand']) : 0,
            'floor_demand' => isset($raw['floor_demand']) ? intval($raw['floor_demand']) : 0,
            'coldStage'    => isset($raw['coldStage']) ? intval($raw['coldStage']) : 1,
            'coldStages'   => isset($raw['coldStages']) ? intval($raw['coldStages']) : 1,
            'heatStage'    => isset($raw['heatStage']) ? intval($raw['heatStage']) : 1,
            'heatStages'   => isset($raw['heatStages']) ? intval($raw['heatStages']) : 1,
            'sleep'        => isset($raw['sleep']) ? intval($raw['sleep']) : 0,
            'units'        => isset($raw['units']) ? intval($raw['units']) : 0,
            'errors'       => (isset($raw['errors']) && is_array($raw['errors'])) ? $raw['errors'] : array()
        );
    }

    /**
     * Envoie une commande PUT /api/v1/hvac à une zone ou un système
     */
    public static function setZoneParameters($systemId, $zoneId, $params = array(), $ip = null, $port = null) {
        $payload = array_merge(
            array(
                'systemID' => intval($systemId),
                'zoneID'   => intval($zoneId)
            ),
            $params
        );
        $res = self::requestApi('/api/v1/hvac', $payload, 'PUT', $ip, $port);
        if (isset($res['errors']) && !empty($res['errors'])) {
            $errMsg = is_array($res['errors'][0]) ? implode(', ', $res['errors'][0]) : json_encode($res['errors']);
            throw new Exception('Erreur Airfree PUT : ' . $errMsg);
        }
        return $res;
    }

    /**
     * Synchronise les zones Airfree avec les équipements eqLogic Jeedom
     */
    public static function synchronize() {
        $data = self::fetchAllSystems(null, null, null, true);
        $discoveredSysIds = array();
        $count = 0;

        foreach ($data['systems'] as $sys) {
            $discoveredSysIds[] = $sys['systemID'];
            foreach ($sys['zones'] as $z) {
                $logicalId = $z['logicalId'];
                $eqLogic = self::byLogicalId($logicalId, 'airfree');
                if (!is_object($eqLogic)) {
                    $eqLogic = new airfree();
                    $eqLogic->setEqType_name('airfree');
                    $eqLogic->setLogicalId($logicalId);
                    $eqLogic->setName($sys['groupName'] . ' - ' . $z['name']);
                    $eqLogic->setIsEnable(1);
                    $eqLogic->setIsVisible($z['available'] ? 1 : 0);
                    $eqLogic->setCategory('heating', 1);
                }
                $eqLogic->setConfiguration('systemID', $z['systemID']);
                $eqLogic->setConfiguration('zoneID', $z['zoneID']);
                $eqLogic->setConfiguration('groupName', $sys['groupName']);
                $eqLogic->setConfiguration('zoneName', $z['name']);
                $eqLogic->setConfiguration('minTemp', $z['minTemp']);
                $eqLogic->setConfiguration('maxTemp', $z['maxTemp']);
                $eqLogic->setConfiguration('isMaster', $z['isMaster']);
                $eqLogic->save();

                $eqLogic->createOrUpdateCommands($z);
                $eqLogic->updateCommandsFromZone($z);
                $count++;
            }
        }

        if (!empty($discoveredSysIds)) {
            config::save('airfree_systems', implode(',', array_unique($discoveredSysIds)), 'airfree');
        }

        return array(
            'count'   => $count,
            'systems' => $discoveredSysIds,
            'data'    => $data
        );
    }

    /**
     * Rafraîchit tous les équipements Jeedom depuis le Webserver Airfree
     */
    public static function refreshAllZones() {
        $data = self::fetchAllSystems();
        foreach ($data['zones'] as $z) {
            $eqLogic = self::byLogicalId($z['logicalId'], 'airfree');
            if (is_object($eqLogic) && $eqLogic->getIsEnable() == 1) {
                $eqLogic->updateCommandsFromZone($z);
            }
        }
        return $data;
    }

    /**
     * Crée les commandes Jeedom (Info & Action) calquées sur l'intégration Home Assistant airfree
     */
    public function createOrUpdateCommands($zoneData = array()) {
        $minTemp = isset($zoneData['minTemp']) ? $zoneData['minTemp'] : $this->getConfiguration('minTemp', 15);
        $maxTemp = isset($zoneData['maxTemp']) ? $zoneData['maxTemp'] : $this->getConfiguration('maxTemp', 30);

        $commandsDef = array(
            // Commandes INFO
            array('logicalId' => 'on',           'name' => 'État',               'type' => 'info',   'subType' => 'binary',  'generic' => 'THERMOSTAT_STATE',       'order' => 1),
            array('logicalId' => 'roomTemp',     'name' => 'Température',        'type' => 'info',   'subType' => 'numeric', 'generic' => 'THERMOSTAT_TEMPERATURE', 'unit' => '°C', 'order' => 2),
            array('logicalId' => 'setpoint',     'name' => 'Consigne',           'type' => 'info',   'subType' => 'numeric', 'generic' => 'THERMOSTAT_SETPOINT',    'unit' => '°C', 'order' => 3),
            array('logicalId' => 'humidity',     'name' => 'Humidité',           'type' => 'info',   'subType' => 'numeric', 'generic' => 'HUMIDITY',               'unit' => '%',  'order' => 4),
            array('logicalId' => 'mode',         'name' => 'Mode ID',            'type' => 'info',   'subType' => 'numeric', 'generic' => 'THERMOSTAT_MODE',        'order' => 5),
            array('logicalId' => 'mode_label',   'name' => 'Mode',               'type' => 'info',   'subType' => 'string',  'generic' => 'THERMOSTAT_MODE_NAME',   'order' => 6),
            array('logicalId' => 'air_demand',   'name' => 'Demande Air',        'type' => 'info',   'subType' => 'binary',  'generic' => 'DONT',                   'order' => 7),
            array('logicalId' => 'floor_demand', 'name' => 'Demande Plancher',   'type' => 'info',   'subType' => 'binary',  'generic' => 'DONT',                   'order' => 8),
            array('logicalId' => 'sleep',        'name' => 'Veille (Sleep)',     'type' => 'info',   'subType' => 'numeric', 'generic' => 'DONT',                   'unit' => 'min','order' => 9),
            array('logicalId' => 'available',    'name' => 'Disponible',         'type' => 'info',   'subType' => 'binary',  'generic' => 'DONT',                   'order' => 10),
            array('logicalId' => 'errors',       'name' => 'Erreurs',            'type' => 'info',   'subType' => 'string',  'generic' => 'DONT',                   'order' => 11),

            // Commandes ACTION
            array('logicalId' => 'power_on',     'name' => 'Marche (ON)',        'type' => 'action', 'subType' => 'other',   'generic' => 'ENERGY_ON',              'value' => 'on',       'order' => 12),
            array('logicalId' => 'power_off',    'name' => 'Arrêt (OFF)',        'type' => 'action', 'subType' => 'other',   'generic' => 'ENERGY_OFF',             'value' => 'on',       'order' => 13),
            array('logicalId' => 'toggle',       'name' => 'Basculer ON/OFF',    'type' => 'action', 'subType' => 'other',   'generic' => 'DONT',                   'value' => 'on',       'order' => 14),
            array('logicalId' => 'set_setpoint', 'name' => 'Régler Consigne',    'type' => 'action', 'subType' => 'slider',  'generic' => 'THERMOSTAT_SET_SETPOINT','value' => 'setpoint', 'min' => $minTemp, 'max' => $maxTemp, 'step' => 0.5, 'unit' => '°C', 'order' => 15),
            array('logicalId' => 'set_mode',     'name' => 'Changer Mode',       'type' => 'action', 'subType' => 'select',  'generic' => 'THERMOSTAT_SET_MODE',    'value' => 'mode',     'listValue' => '1|Arrêt;2|Refroidissement;3|Chauffage;4|Ventilation;5|Déshumidification;7|Auto', 'order' => 16),
            array('logicalId' => 'set_sleep',    'name' => 'Minuterie Veille',   'type' => 'action', 'subType' => 'select',  'generic' => 'DONT',                   'value' => 'sleep',    'listValue' => '0|Désactivé;30|30 min;60|60 min;90|90 min', 'order' => 17),
            array('logicalId' => 'refresh',      'name' => 'Rafraîchir',         'type' => 'action', 'subType' => 'other',   'generic' => 'DONT',                   'order' => 18)
        );

        // Première passe : créer les infos
        $infoCmds = array();
        foreach ($commandsDef as $def) {
            $cmd = $this->getCmd(null, $def['logicalId']);
            if (!is_object($cmd)) {
                $cmd = new airfreeCmd();
                $cmd->setLogicalId($def['logicalId']);
                $cmd->setEqLogic_id($this->getId());
                $cmd->setName(__($def['name'], __FILE__));
                $cmd->setIsVisible(1);
            }
            $cmd->setType($def['type']);
            $cmd->setSubType($def['subType']);
            $cmd->setOrder($def['order']);
            if (isset($def['generic'])) {
                $cmd->setGeneric_type($def['generic']);
            }
            if (isset($def['unit'])) {
                $cmd->setUnite($def['unit']);
            }
            if (isset($def['min'])) {
                $cmd->setConfiguration('minValue', $def['min']);
            }
            if (isset($def['max'])) {
                $cmd->setConfiguration('maxValue', $def['max']);
            }
            if (isset($def['listValue'])) {
                $cmd->setConfiguration('listValue', $def['listValue']);
            }
            if ($def['type'] === 'action' && isset($def['value']) && isset($infoCmds[$def['value']])) {
                $cmd->setValue($infoCmds[$def['value']]->getId());
            }
            $cmd->save();
            if ($def['type'] === 'info') {
                $infoCmds[$def['logicalId']] = $cmd;
            }
        }
    }

    /**
     * Met à jour les valeurs des commandes Info Jeedom à partir des données de la zone
     */
    public function updateCommandsFromZone($z) {
        $this->checkAndUpdateCmd('on', $z['on']);
        $this->checkAndUpdateCmd('roomTemp', $z['roomTemp']);
        $this->checkAndUpdateCmd('setpoint', $z['setpoint']);
        $this->checkAndUpdateCmd('humidity', $z['humidity']);
        $this->checkAndUpdateCmd('mode', $z['mode']);
        $this->checkAndUpdateCmd('mode_label', $z['modeLabel']);
        $this->checkAndUpdateCmd('air_demand', $z['air_demand']);
        $this->checkAndUpdateCmd('floor_demand', $z['floor_demand']);
        $this->checkAndUpdateCmd('sleep', $z['sleep']);
        $this->checkAndUpdateCmd('available', $z['available']);
        $this->checkAndUpdateCmd('errors', empty($z['errors']) ? 'Aucune' : json_encode($z['errors']));
    }

    /**
     * Rendu HTML personnalisé du Widget Jeedom (Dashboard & Mobile) inspiré d'Airfree Cloud
     */
    public function toHtml($_version = 'dashboard') {
        $replace = $this->preToHtml($_version);
        if (!is_array($replace)) {
            return $replace;
        }
        $version = jeedom::versionAlias($_version);

        $onCmd       = $this->getCmd('info', 'on');
        $roomTempCmd = $this->getCmd('info', 'roomTemp');
        $setpointCmd = $this->getCmd('info', 'setpoint');
        $humidityCmd = $this->getCmd('info', 'humidity');
        $modeCmd     = $this->getCmd('info', 'mode');
        $modeLblCmd  = $this->getCmd('info', 'mode_label');
        $availCmd    = $this->getCmd('info', 'available');
        $toggleCmd   = $this->getCmd('action', 'toggle');
        $setpointAct = $this->getCmd('action', 'set_setpoint');

        $roomTemp = is_object($roomTempCmd) ? floatval($roomTempCmd->execCmd()) : 0.0;
        $tempInt  = floor($roomTemp);
        $tempDec  = round(($roomTemp - $tempInt) * 10);

        $replace['#zone_name#']     = $this->getConfiguration('zoneName', $this->getName());
        $replace['#group_name#']    = $this->getConfiguration('groupName', 'Groupe');
        $replace['#on#']            = is_object($onCmd) ? intval($onCmd->execCmd()) : 0;
        $replace['#available#']     = is_object($availCmd) ? intval($availCmd->execCmd()) : 1;
        $replace['#roomTemp#']      = $roomTemp;
        $replace['#temp_int#']      = $tempInt;
        $replace['#temp_dec#']      = $tempDec;
        $replace['#setpoint#']      = is_object($setpointCmd) ? floatval($setpointCmd->execCmd()) : 21.0;
        $replace['#humidity#']      = is_object($humidityCmd) ? intval($humidityCmd->execCmd()) : 0;
        $replace['#mode#']          = is_object($modeCmd) ? intval($modeCmd->execCmd()) : 3;
        $replace['#mode_label#']    = is_object($modeLblCmd) ? $modeLblCmd->execCmd() : 'Chauffage';
        $replace['#toggle_id#']     = is_object($toggleCmd) ? $toggleCmd->getId() : '';
        $replace['#setpoint_id#']   = is_object($setpointAct) ? $setpointAct->getId() : '';
        $replace['#min_temp#']      = $this->getConfiguration('minTemp', 15);
        $replace['#max_temp#']      = $this->getConfiguration('maxTemp', 30);

        return $this->postToHtml($_version, template_replace($replace, getTemplate('core', $version, 'eqLogic', 'airfree')));
    }
}

class airfreeCmd extends cmd {

    public function execute($_options = array()) {
        if ($this->getType() !== 'action') {
            return;
        }
        /** @var airfree $eqLogic */
        $eqLogic  = $this->getEqLogic();
        $systemId = intval($eqLogic->getConfiguration('systemID', 1));
        $zoneId   = intval($eqLogic->getConfiguration('zoneID', 1));
        $logical  = $this->getLogicalId();

        switch ($logical) {
            case 'power_on':
                airfree::setZoneParameters($systemId, $zoneId, array('on' => 1));
                break;
            case 'power_off':
                airfree::setZoneParameters($systemId, $zoneId, array('on' => 0));
                break;
            case 'toggle':
                $onCmd = $eqLogic->getCmd('info', 'on');
                $curOn = is_object($onCmd) ? intval($onCmd->execCmd()) : 0;
                airfree::setZoneParameters($systemId, $zoneId, array('on' => ($curOn ? 0 : 1)));
                break;
            case 'set_setpoint':
                $val = isset($_options['slider']) ? round(floatval($_options['slider']) * 2) / 2 : 21.0;
                airfree::setZoneParameters($systemId, $zoneId, array('setpoint' => $val));
                break;
            case 'set_mode':
                $mode = isset($_options['select']) ? intval($_options['select']) : airfree::MODE_HEATING;
                airfree::setZoneParameters($systemId, $zoneId, array('mode' => $mode));
                break;
            case 'set_sleep':
                $sleep = isset($_options['select']) ? intval($_options['select']) : 0;
                airfree::setZoneParameters($systemId, $zoneId, array('sleep' => $sleep));
                break;
            case 'refresh':
                break;
        }

        // Rafraîchir l'état après l'action
        airfree::refreshAllZones();
    }
}
