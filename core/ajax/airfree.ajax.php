<?php
/* This file is part of Jeedom.
 *
 * Contrôleur AJAX du plugin Airfree
 */

try {
    require_once dirname(__FILE__) . '/../../../../core/php/core.inc.php';
    include_file('core', 'authentification', 'php');

    if (!isConnect()) {
        throw new Exception(__('401 - Accès non autorisé', __FILE__));
    }

    ajax::init();
    $action = init('action');

    if ($action === 'synchronize' || $action === 'saveConnectionConfig' || $action === 'testConnection') {
        if (!isConnect('admin')) {
            throw new Exception(__('403 - Droits administrateur requis pour cette action', __FILE__));
        }
    }

    if ($action === 'testConnection') {
        $ip      = init('ip', config::byKey('airfree_ip', 'airfree', '192.168.0.61'));
        $port    = init('port', config::byKey('airfree_port', 'airfree', '3000'));
        $systems = init('systems', config::byKey('airfree_systems', 'airfree', '1,3'));
        $data    = airfree::fetchAllSystems($ip, $port, $systems, false);

        $sysCount  = count($data['systems']);
        $zoneCount = count($data['zones']);
        ajax::success(array(
            'summary' => $sysCount . ' groupe(s) et ' . $zoneCount . ' zone(s) détectée(s) sur ' . $ip . ':' . $port,
            'data'    => $data
        ));
    }

    if ($action === 'synchronize') {
        $res = airfree::synchronize();
        ajax::success($res);
    }

    if ($action === 'getFullState') {
        $ip      = init('ip', null);
        $port    = init('port', null);
        $systems = init('systems', null);
        $data    = airfree::fetchAllSystems($ip, $port, $systems, false);
        ajax::success($data);
    }

    if ($action === 'setZoneParam') {
        $systemId = intval(init('systemID', 1));
        $zoneId   = intval(init('zoneID', 0));
        $params   = json_decode(init('params', '{}'), true);
        if (!is_array($params) || empty($params)) {
            throw new Exception(__('Paramètres vides ou invalides', __FILE__));
        }
        $ip   = init('ip', null);
        $port = init('port', null);
        $putRes = airfree::setZoneParameters($systemId, $zoneId, $params, $ip, $port);
        ajax::success(array(
            'systemID'    => $systemId,
            'zoneID'      => $zoneId,
            'applied'     => $params,
            'putResponse' => $putRes
        ));
    }

    if ($action === 'setGroupPower') {
        $systemId = intval(init('systemID', 1));
        $on       = intval(init('on', 0)) ? 1 : 0;
        $ip       = init('ip', null);
        $port     = init('port', null);
        $putRes   = airfree::setZoneParameters($systemId, 0, array('on' => $on), $ip, $port);
        ajax::success(array(
            'systemID'    => $systemId,
            'on'          => $on,
            'putResponse' => $putRes
        ));
    }

    if ($action === 'setAllPower') {
        $on    = intval(init('on', 0)) ? 1 : 0;
        $ip    = init('ip', null);
        $port  = init('port', null);
        $state = airfree::fetchAllSystems($ip, $port);
        foreach ($state['zones'] as $z) {
            if ($z['available']) {
                airfree::setZoneParameters($z['systemID'], $z['zoneID'], array('on' => $on), $ip, $port);
            }
        }
        $data = airfree::refreshAllZones();
        ajax::success($data);
    }

    if ($action === 'saveConnectionConfig') {
        $ip       = trim(init('ip', '192.168.0.61'));
        $port     = intval(init('port', 3000));
        $systems  = trim(init('systems', '1,3'));
        $instName = trim(init('installName', 'Bureaux'));
        $instLoc  = trim(init('installLoc', 'Montpellier, Hérault'));

        config::save('airfree_ip', $ip, 'airfree');
        config::save('airfree_port', $port, 'airfree');
        config::save('airfree_systems', $systems, 'airfree');
        config::save('airfree_install_name', $instName, 'airfree');
        config::save('airfree_install_location', $instLoc, 'airfree');

        $data = airfree::fetchAllSystems($ip, $port, $systems, false);
        ajax::success($data);
    }

    throw new Exception(__('Aucune méthode correspondante à : ', __FILE__) . $action);
} catch (Exception $e) {
    ajax::error(displayException($e), $e->getCode());
}
