<?php
/* This file is part of Jeedom.
 *
 * Jeedom is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

require_once dirname(__FILE__) . '/../../../core/php/core.inc.php';

function airfree_install() {
    $cron = cron::byClassAndFunction('airfree', 'pull');
    if (!is_object($cron)) {
        $cron = new cron();
        $cron->setClass('airfree');
        $cron->setFunction('pull');
        $cron->setEnable(1);
        $cron->setDeamon(0);
        $cron->setSchedule('*/5 * * * *');
        $cron->setTimeout(2);
        $cron->save();
    }
    if (config::byKey('airfree_ip', 'airfree', '') === '') {
        config::save('airfree_ip', '192.168.0.61', 'airfree');
    }
    if (config::byKey('airfree_port', 'airfree', '') === '') {
        config::save('airfree_port', '3000', 'airfree');
    }
    if (config::byKey('airfree_systems', 'airfree', '') === '') {
        config::save('airfree_systems', '1,3', 'airfree');
    }
    config::save('displayDesktopPanel', 1, 'airfree');
    config::save('displayMobilePanel', 1, 'airfree');
    try {
        if (class_exists('airfree')) {
            airfree::synchronize();
        }
    } catch (Exception $e) {
    }
}

function airfree_update() {
    $cron = cron::byClassAndFunction('airfree', 'pull');
    if (!is_object($cron)) {
        $cron = new cron();
        $cron->setClass('airfree');
        $cron->setFunction('pull');
        $cron->setEnable(1);
        $cron->setDeamon(0);
        $cron->setSchedule('*/5 * * * *');
        $cron->setTimeout(2);
        $cron->save();
    }
    config::save('displayDesktopPanel', 1, 'airfree');
    config::save('displayMobilePanel', 1, 'airfree');
    try {
        require_once dirname(__FILE__) . '/../core/class/airfree.class.php';
        if (class_exists('airfree')) {
            airfree::synchronize();
        }
    } catch (Exception $e) {
    }
}

function airfree_remove() {
    $cron = cron::byClassAndFunction('airfree', 'pull');
    if (is_object($cron)) {
        $cron->remove();
    }
}
