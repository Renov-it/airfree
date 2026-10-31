<?php
/**
 * Pont API Locale Airfree (compatible Standalone & Jeedom)
 * Implémente l'intégralité du protocole local Home Assistant core/components/airfree (aioairfree)
 * - POST http://<ip>:3000/api/v1/hvac
 * - PUT  http://<ip>:3000/api/v1/hvac
 * - POST http://<ip>:3000/api/v1/webserver
 * - POST http://<ip>:3000/api/v1/integration
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: no-referrer');

// Protection CORS : n'autoriser que les origines locales (même hôte / localhost / RFC1918)
if (!empty($_SERVER['HTTP_ORIGIN'])) {
    $originHost = parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST);
    if ($originHost === 'localhost' || $originHost === '127.0.0.1' || $originHost === ($_SERVER['SERVER_NAME'] ?? '')) {
        header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
        header('Vary: Origin');
    }
}
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$configFile = __DIR__ . '/config_local.json';

$defaultConfig = array(
    'activeInstallationId' => 'bureaux',
    'hideExtraUnconfiguredZones' => true,
    'installations' => array(
        array(
            'id'        => 'maison_lm',
            'name'      => 'Maison LM',
            'location'  => 'Montpellier, Hérault',
            'type'      => 'house',
            'ip'        => '192.168.0.48',
            'port'      => 3000,
            'systems'   => '1',
            'alias'     => 'Dispositif_1A3B',
            'mac'       => '50:26:EF:2A:1A:3B',
            'firmware'  => '4.16',
            'wifiSsid'  => 'new',
            'cloudSub'  => false
        ),
        array(
            'id'        => 'bureaux',
            'name'      => 'Bureaux',
            'location'  => 'Montpellier, Hérault',
            'type'      => 'office',
            'ip'        => '192.168.0.61',
            'port'      => 3000,
            'systems'   => '1,3',
            'alias'     => 'Dispositif_43D1',
            'mac'       => '18:48:CA:8E:43:D1',
            'firmware'  => '4.16',
            'wifiSsid'  => 'LAN / Wi-Fi Local',
            'cloudSub'  => false
        )
    ),
    'zoneAliases' => array(),
    'hiddenZones' => array(
        'sys_1_zone_4',
        'sys_1_zone_5',
        'sys_3_zone_1',
        'sys_3_zone_4',
        'sys_3_zone_6'
    )
);

function loadLocalConfig($configFile, $defaultConfig) {
    if (file_exists($configFile)) {
        $raw = file_get_contents($configFile);
        $dec = json_decode($raw, true);
        if (is_array($dec)) {
            return array_replace_recursive($defaultConfig, $dec);
        }
    }
    return $defaultConfig;
}

function saveLocalConfig($configFile, $cfg) {
    file_put_contents($configFile, json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    @chmod($configFile, 0600);
}

/**
 * Validation stricte anti-SSRF : autorise uniquement une IPv4 privée RFC1918 (10.x, 172.16-31.x, 192.168.x)
 */
function validateLanIp($ip) {
    $ip = trim((string)$ip);
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        throw new Exception('Adresse IPv4 invalide : ' . htmlspecialchars($ip, ENT_QUOTES, 'UTF-8'));
    }
    if (!preg_match('/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/', $ip)) {
        throw new Exception('Sécurité SSRF : seules les adresses IP privées locales (RFC1918) sont autorisées.');
    }
    return $ip;
}

function validateLanPort($port) {
    $p = intval($port);
    if ($p < 80 || $p > 65535) {
        throw new Exception('Port TCP invalide (doit être compris entre 80 et 65535).');
    }
    return $p;
}

function callAirfreeDevice($ip, $port, $endpoint, $payload = array(), $method = 'POST', $timeout = 4) {
    $allowedEndpoints = array('/api/v1/hvac', '/api/v1/webserver', '/api/v1/version', '/api/v1/integration');
    if (!in_array($endpoint, $allowedEndpoints, true)) {
        return array('_network_error' => 'Endpoint API non autorisé');
    }
    try {
        $safeIp   = validateLanIp($ip);
        $safePort = validateLanPort($port);
    } catch (Exception $e) {
        return array('_network_error' => $e->getMessage());
    }
    $url = 'http://' . $safeIp . ':' . $safePort . $endpoint;
    $body = empty($payload) ? '{}' : json_encode($payload, JSON_UNESCAPED_UNICODE);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $timeout);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array(
            'Content-Type: application/json',
            'Content-Length: ' . strlen($body)
        ));
        $response = curl_exec($ch);
        $err = curl_error($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false) {
            return array('_network_error' => 'Impossible de joindre ' . $url . ' (' . $err . ')');
        }
    } else {
        $opts = array(
            'http' => array(
                'method'        => strtoupper($method),
                'header'        => "Content-Type: application/json\r\nContent-Length: " . strlen($body) . "\r\n",
                'content'       => $body,
                'timeout'       => $timeout,
                'ignore_errors' => true
            )
        );
        $ctx = stream_context_create($opts);
        $response = @file_get_contents($url, false, $ctx);
        if ($response === false) {
            $lastErr = error_get_last();
            return array('_network_error' => 'Impossible de joindre ' . $url . ' (' . ($lastErr['message'] ?? 'Timeout') . ')');
        }
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        return array('_network_error' => 'Réponse JSON invalide depuis ' . $url, 'raw' => $response);
    }
    return $decoded;
}

function getModeLabel($mode) {
    $map = array(
        1 => 'Arrêt',
        2 => 'Refroidissement',
        3 => 'Chauffage',
        4 => 'Ventilation',
        5 => 'Déshumidification',
        7 => 'Auto'
    );
    return isset($map[$mode]) ? $map[$mode] : ('Mode ' . $mode);
}

function normalizeZoneItem($z, $cfg) {
    $sysId  = isset($z['systemID']) ? intval($z['systemID']) : 1;
    $zoneId = isset($z['zoneID']) ? intval($z['zoneID']) : 1;
    $logicalId = 'sys_' . $sysId . '_zone_' . $zoneId;

    $rawName = isset($z['name']) ? trim($z['name']) : ('Zone ' . $zoneId);
    $displayName = isset($cfg['zoneAliases'][$logicalId]) ? $cfg['zoneAliases'][$logicalId] : $rawName;

    $roomTemp = isset($z['roomTemp']) ? round(floatval($z['roomTemp']), 1) : 0.0;
    $setpoint = isset($z['setpoint']) ? round(floatval($z['setpoint']), 1) : 21.0;
    $humidity = isset($z['humidity']) ? intval($z['humidity']) : 0;
    $on       = isset($z['on']) ? intval($z['on']) : 0;
    $mode     = isset($z['mode']) ? intval($z['mode']) : 3;
    $modes    = (isset($z['modes']) && is_array($z['modes'])) ? $z['modes'] : array();
    $minTemp  = isset($z['minTemp']) ? floatval($z['minTemp']) : 15.0;
    $maxTemp  = isset($z['maxTemp']) ? floatval($z['maxTemp']) : 30.0;

    $available = !($roomTemp <= 0.0 && $humidity <= 0);
    $isDefaultUnconfigured = (bool)preg_match('/^(ZONA|ZONE)\s*\d+$/i', $rawName) && !$available;
    $isHidden  = $isDefaultUnconfigured || in_array($logicalId, $cfg['hiddenZones'] ?? array(), true);

    return array(
        'logicalId'    => $logicalId,
        'systemID'     => $sysId,
        'zoneID'       => $zoneId,
        'rawName'      => $rawName,
        'name'         => $displayName,
        'on'           => $on,
        'available'    => $available ? 1 : 0,
        'hidden'       => $isHidden ? 1 : 0,
        'isMaster'     => !empty($modes) ? 1 : 0,
        'roomTemp'     => $roomTemp,
        'setpoint'     => $setpoint,
        'minTemp'      => $minTemp,
        'maxTemp'      => $maxTemp,
        'humidity'     => $humidity,
        'mode'         => $mode,
        'modeLabel'    => getModeLabel($mode),
        'modes'        => $modes,
        'air_demand'   => isset($z['air_demand']) ? intval($z['air_demand']) : 0,
        'floor_demand' => isset($z['floor_demand']) ? intval($z['floor_demand']) : 0,
        'coldStage'    => isset($z['coldStage']) ? intval($z['coldStage']) : 1,
        'coldStages'   => isset($z['coldStages']) ? intval($z['coldStages']) : 1,
        'heatStage'    => isset($z['heatStage']) ? intval($z['heatStage']) : 1,
        'heatStages'   => isset($z['heatStages']) ? intval($z['heatStages']) : 1,
        'sleep'        => isset($z['sleep']) ? intval($z['sleep']) : 0,
        'units'        => isset($z['units']) ? intval($z['units']) : 0,
        'errors'       => (isset($z['errors']) && is_array($z['errors'])) ? $z['errors'] : array()
    );
}

function detectMacFromArp($ip) {
    if (!preg_match('/^\d{1,3}(\.\d{1,3}){3}$/', $ip)) {
        return null;
    }
    $out = @shell_exec('arp -a ' . escapeshellarg($ip) . ' 2>&1');
    if (is_string($out) && preg_match('/([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}/', $out, $m)) {
        return strtoupper(str_replace('-', ':', $m[0]));
    }
    return null;
}

function detectLocalWifiSsid() {
    if (stripos(PHP_OS, 'WIN') === 0) {
        $out = @shell_exec('netsh wlan show interfaces 2>&1');
        if (is_string($out) && preg_match('/^\s*SSID\s*:\s*(.+)$/mi', $out, $m)) {
            return trim($m[1]);
        }
    } else {
        $out = @shell_exec('iwgetid -r 2>/dev/null');
        if (is_string($out) && trim($out) !== '') {
            return trim($out);
        }
    }
    return null;
}

function fetchDeviceInfo($ip, $port, $activeInst, $online, $latencyMs) {
    $mac      = $activeInst['mac'] ?? '';
    $firmware = 'API Locale v1 (/api/v1/hvac)';
    $wifiSsid = !empty($activeInst['wifiSsid']) ? $activeInst['wifiSsid'] : (detectLocalWifiSsid() ?: 'Non communiqué par /api/v1/webserver');
    $alias    = $activeInst['alias'] ?? '';
    $rssi     = null;

    if ($online) {
        // 1. Tenter POST /api/v1/webserver (supporté sur certains firmwares)
        $wsRes = callAirfreeDevice($ip, $port, '/api/v1/webserver', array(), 'POST', 2);
        if (is_array($wsRes) && !isset($wsRes['errors']) && !isset($wsRes['_network_error'])) {
            if (!empty($wsRes['mac'])) {
                $mac = strtoupper($wsRes['mac']);
            }
            if (!empty($wsRes['ws_firmware'])) {
                $firmware = $wsRes['ws_firmware'];
            }
            if (!empty($wsRes['wifi_ssid']) || !empty($wsRes['interface'])) {
                $wifiSsid = $wsRes['wifi_ssid'] ?? $wsRes['interface'];
            }
            if (isset($wsRes['wifi_rssi'])) {
                $rssi = intval($wsRes['wifi_rssi']);
            }
        }
        // 2. Fallback ARP local pour récupérer l'adresse MAC physique réelle
        $arpMac = detectMacFromArp($ip);
        if (!empty($arpMac)) {
            $mac = $arpMac;
        }
    }

    if (empty($alias) && !empty($mac)) {
        $cleanHex = str_replace(':', '', $mac);
        $alias = 'Dispositif_' . strtoupper(substr($cleanHex, -4));
    } elseif (!empty($mac)) {
        $cleanHex = str_replace(':', '', $mac);
        $alias = 'Dispositif_' . strtoupper(substr($cleanHex, -4));
    }

    $pingMs = max(1, intval(round($latencyMs / 3)));
    $quality = 'Hors ligne';
    if ($online) {
        if ($pingMs < 150) {
            $quality = 'Excellente';
        } elseif ($pingMs < 350) {
            $quality = 'Bonne';
        } else {
            $quality = 'Moyenne';
        }
    }

    return array(
        'alias'     => $alias ?: 'Dispositif_Local',
        'mac'       => $mac ?: 'Non détectée',
        'firmware'  => $firmware,
        'ip'        => $ip,
        'port'      => intval($port),
        'wifi'      => $wifiSsid,
        'rssi'      => $rssi,
        'quality'   => $quality,
        'latencyMs' => $pingMs,
        'online'    => $online
    );
}

function fetchAirfreeState($ip, $port, $systemsCsv, $cfg, $autoScan = false) {
    $tStart = microtime(true);
    $allZones = array();
    $online = true;
    $errorMsg = null;

    // 1. Test broadcast systemID: 0
    $res0 = callAirfreeDevice($ip, $port, '/api/v1/hvac', array('systemID' => 0, 'zoneID' => 0), 'POST');
    if (isset($res0['_network_error'])) {
        $online = false;
        $errorMsg = $res0['_network_error'];
    } elseif (isset($res0['data']) && is_array($res0['data']) && count($res0['data']) > 0) {
        foreach ($res0['data'] as $z) {
            $allZones[] = normalizeZoneItem($z, $cfg);
        }
    } elseif (isset($res0['systems']) && is_array($res0['systems'])) {
        foreach ($res0['systems'] as $sys) {
            if (isset($sys['data']) && is_array($sys['data'])) {
                foreach ($sys['data'] as $z) {
                    $allZones[] = normalizeZoneItem($z, $cfg);
                }
            }
        }
    } else {
        // 2. Interrogation par systemID explicite (cas standard Webserver où systemID:0 -> "systemid out of range")
        $sysList = array();
        if ($autoScan) {
            $sysList = range(1, 8);
        } else {
            foreach (explode(',', $systemsCsv) as $s) {
                $id = intval(trim($s));
                if ($id > 0 && $id <= 32) {
                    $sysList[] = $id;
                }
            }
            if (empty($sysList)) {
                $sysList = array(1, 3);
            }
        }

        foreach ($sysList as $sysId) {
            $resSys = callAirfreeDevice($ip, $port, '/api/v1/hvac', array('systemID' => $sysId, 'zoneID' => 0), 'POST');
            if (isset($resSys['_network_error'])) {
                $online = false;
                $errorMsg = $resSys['_network_error'];
                break;
            }
            if (isset($resSys['data']) && is_array($resSys['data']) && count($resSys['data']) > 0) {
                foreach ($resSys['data'] as $z) {
                    $allZones[] = normalizeZoneItem($z, $cfg);
                }
            }
        }
    }

    // Tri optionnel pour fidélité visuelle avec l'ordre Airfree Cloud (Groupe 1: Open space, Bureau2, Bureau1, Bureau0 / Groupe 2: Entree, SR-Yoda, SR-Windu)
    $preferredOrder = array(
        'sys_1_zone_1' => 1, // Open space
        'sys_1_zone_6' => 2, // Bureau2
        'sys_1_zone_2' => 3, // Bureau1
        'sys_1_zone_3' => 4, // Bureau0
        'sys_1_zone_4' => 5, // ZONA 04 (inutilisée)
        'sys_1_zone_5' => 6, // ZONA 05 (inutilisée)
        'sys_3_zone_3' => 1, // Entree
        'sys_3_zone_5' => 2, // SR-Yoda
        'sys_3_zone_2' => 3, // SR-Windu
        'sys_3_zone_1' => 4,
        'sys_3_zone_4' => 5,
        'sys_3_zone_6' => 6
    );

    usort($allZones, function($a, $b) use ($preferredOrder) {
        if ($a['systemID'] !== $b['systemID']) {
            return $a['systemID'] <=> $b['systemID'];
        }
        $oa = $preferredOrder[$a['logicalId']] ?? ($a['zoneID'] + 10);
        $ob = $preferredOrder[$b['logicalId']] ?? ($b['zoneID'] + 10);
        return $oa <=> $ob;
    });

    $systemsMap = array();
    $groupIdx = 1;
    foreach ($allZones as $z) {
        $sysId = $z['systemID'];
        if (!isset($systemsMap[$sysId])) {
            $systemsMap[$sysId] = array(
                'systemID'     => $sysId,
                'groupNumber'  => $groupIdx,
                'groupName'    => 'Groupe ' . $groupIdx,
                'mode'         => $z['mode'],
                'modeLabel'    => $z['modeLabel'],
                'modes'        => $z['modes'],
                'masterZoneID' => $z['zoneID'],
                'anyOn'        => false,
                'zones'        => array()
            );
            $groupIdx++;
        }
        if (!empty($z['modes'])) {
            $systemsMap[$sysId]['modes'] = $z['modes'];
            $systemsMap[$sysId]['masterZoneID'] = $z['zoneID'];
            $systemsMap[$sysId]['mode'] = $z['mode'];
            $systemsMap[$sysId]['modeLabel'] = $z['modeLabel'];
        }
        if ($z['available'] && $z['on'] == 1) {
            $systemsMap[$sysId]['anyOn'] = true;
        }
        $systemsMap[$sysId]['zones'][] = $z;
    }

    $latencyMs = round((microtime(true) - $tStart) * 1000);
    $activeInst = $cfg['installations'][1] ?? array('ip' => $ip, 'port' => $port);
    foreach ($cfg['installations'] as $inst) {
        if (($inst['id'] ?? '') === ($cfg['activeInstallationId'] ?? 'bureaux')) {
            $activeInst = $inst;
            break;
        }
    }
    $deviceInfo = fetchDeviceInfo($ip, $port, $activeInst, $online, $latencyMs);

    return array(
        'online'     => $online,
        'error'      => $errorMsg,
        'ip'         => $ip,
        'port'       => intval($port),
        'deviceInfo' => $deviceInfo,
        'systems'    => array_values($systemsMap),
        'zones'      => $allZones,
        'config'     => $cfg,
        'timestamp'  => date('H:i:s')
    );
}

$cfg = loadLocalConfig($configFile, $defaultConfig);
$inputRaw = file_get_contents('php://input');
$inputJson = json_decode($inputRaw, true);
if (!is_array($inputJson)) {
    $inputJson = array();
}

$action = $_REQUEST['action'] ?? ($inputJson['action'] ?? 'getFullState');

// Trouver l'installation active
$activeInst = $cfg['installations'][1];
foreach ($cfg['installations'] as $inst) {
    if ($inst['id'] === ($cfg['activeInstallationId'] ?? 'bureaux')) {
        $activeInst = $inst;
        break;
    }
}

$ip      = $_REQUEST['ip'] ?? ($inputJson['ip'] ?? $activeInst['ip']);
$port    = $_REQUEST['port'] ?? ($inputJson['port'] ?? $activeInst['port']);
$systems = $_REQUEST['systems'] ?? ($inputJson['systems'] ?? $activeInst['systems']);

try {
    if ($action === 'getFullState' || $action === 'testConnection') {
        $autoScan = !empty($_REQUEST['autoScan']) || !empty($inputJson['autoScan']);
        $state = fetchAirfreeState($ip, $port, $systems, $cfg, $autoScan);
        echo json_encode(array('state' => 'ok', 'result' => $state), JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'setZoneParam') {
        $systemId = intval($_REQUEST['systemID'] ?? ($inputJson['systemID'] ?? 1));
        $zoneId   = isset($_REQUEST['zoneID']) ? intval($_REQUEST['zoneID']) : (isset($inputJson['zoneID']) ? intval($inputJson['zoneID']) : 1);
        $params   = $_REQUEST['params'] ?? ($inputJson['params'] ?? array());
        if (is_string($params)) {
            $params = json_decode($params, true);
        }
        if (!is_array($params) || empty($params)) {
            throw new Exception('Paramètres de commande invalides');
        }

        $payload = array_merge(array('systemID' => $systemId, 'zoneID' => $zoneId), $params);
        $putRes  = callAirfreeDevice($ip, $port, '/api/v1/hvac', $payload, 'PUT');
        if (isset($putRes['_network_error'])) {
            throw new Exception($putRes['_network_error']);
        }
        if (isset($putRes['errors']) && !empty($putRes['errors'])) {
            throw new Exception('Erreur Airfree : ' . json_encode($putRes['errors']));
        }

        echo json_encode(array(
            'state'       => 'ok',
            'systemID'    => $systemId,
            'zoneID'      => $zoneId,
            'applied'     => $params,
            'putResponse' => $putRes
        ), JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'setGroupPower') {
        $systemId = intval($_REQUEST['systemID'] ?? ($inputJson['systemID'] ?? 1));
        $on       = intval($_REQUEST['on'] ?? ($inputJson['on'] ?? 0)) ? 1 : 0;
        $putRes   = callAirfreeDevice($ip, $port, '/api/v1/hvac', array(
            'systemID' => $systemId,
            'zoneID'   => 0,
            'on'       => $on
        ), 'PUT');
        if (isset($putRes['_network_error'])) {
            throw new Exception($putRes['_network_error']);
        }
        echo json_encode(array(
            'state'       => 'ok',
            'systemID'    => $systemId,
            'on'          => $on,
            'putResponse' => $putRes
        ), JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'setAllPower') {
        $on       = intval($_REQUEST['on'] ?? ($inputJson['on'] ?? 0)) ? 1 : 0;
        $curState = fetchAirfreeState($ip, $port, $systems, $cfg, false);
        foreach ($curState['zones'] as $z) {
            if ($z['available']) {
                callAirfreeDevice($ip, $port, '/api/v1/hvac', array(
                    'systemID' => $z['systemID'],
                    'zoneID'   => $z['zoneID'],
                    'on'       => $on
                ), 'PUT');
            }
        }
        $state = fetchAirfreeState($ip, $port, $systems, $cfg, false);
        echo json_encode(array('state' => 'ok', 'result' => $state), JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'saveConfig') {
        $instId = $_REQUEST['installationId'] ?? ($inputJson['installationId'] ?? $cfg['activeInstallationId']);
        $cfg['activeInstallationId'] = $instId;

        foreach ($cfg['installations'] as &$inst) {
            if ($inst['id'] === $instId) {
                if (isset($inputJson['ip']) || isset($_REQUEST['ip'])) {
                    $inst['ip'] = trim($_REQUEST['ip'] ?? $inputJson['ip']);
                }
                if (isset($inputJson['port']) || isset($_REQUEST['port'])) {
                    $inst['port'] = intval($_REQUEST['port'] ?? $inputJson['port']);
                }
                if (isset($inputJson['systems']) || isset($_REQUEST['systems'])) {
                    $inst['systems'] = trim($_REQUEST['systems'] ?? $inputJson['systems']);
                }
                if (isset($inputJson['wifiSsid']) || isset($_REQUEST['wifiSsid'])) {
                    $inst['wifiSsid'] = trim($_REQUEST['wifiSsid'] ?? $inputJson['wifiSsid']);
                }
                if (isset($inputJson['name']) || isset($_REQUEST['name'])) {
                    $inst['name'] = trim($_REQUEST['name'] ?? $inputJson['name']);
                }
                if (isset($inputJson['location']) || isset($_REQUEST['location'])) {
                    $inst['location'] = trim($_REQUEST['location'] ?? $inputJson['location']);
                }
                $ip      = $inst['ip'];
                $port    = $inst['port'];
                $systems = $inst['systems'];
            }
        }
        unset($inst);

        if (isset($inputJson['hideExtraUnconfiguredZones'])) {
            $cfg['hideExtraUnconfiguredZones'] = (bool)$inputJson['hideExtraUnconfiguredZones'];
        }
        if (isset($inputJson['zoneAliases']) && is_array($inputJson['zoneAliases'])) {
            $cfg['zoneAliases'] = array_merge($cfg['zoneAliases'], $inputJson['zoneAliases']);
        }

        saveLocalConfig($configFile, $cfg);
        $state = fetchAirfreeState($ip, $port, $systems, $cfg, false);
        echo json_encode(array('state' => 'ok', 'result' => $state), JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(array('state' => 'error', 'result' => 'Action inconnue : ' . $action));
} catch (Exception $e) {
    echo json_encode(array('state' => 'error', 'result' => $e->getMessage()));
}
