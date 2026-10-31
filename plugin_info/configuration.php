<?php
/* This file is part of Jeedom.
 *
 * Configuration globale du plugin Airfree Local API
 */
require_once dirname(__FILE__) . '/../../../core/php/core.inc.php';
include_file('core', 'authentification', 'php');
if (!isConnect()) {
    include_file('desktop', '404', 'php');
    die();
}
?>
<form class="form-horizontal">
    <fieldset>
        <legend><i class="fas fa-network-wired"></i> {{Connexion Passerelle Airfree Webserver (API Locale)}}</legend>
        <div class="form-group">
            <label class="col-md-4 control-label">{{Adresse IP du Webserver Airfree}}
                <sup><i class="fas fa-question-circle tooltips" title="{{Adresse IP locale de la passerelle Airfree (ex: 192.168.0.61)}}"></i></sup>
            </label>
            <div class="col-md-4">
                <input type="text" class="configKey form-control" data-l1key="airfree_ip" placeholder="192.168.0.61" />
            </div>
        </div>
        <div class="form-group">
            <label class="col-md-4 control-label">{{Port API Locale}}
                <sup><i class="fas fa-question-circle tooltips" title="{{Port TCP de l'API locale Airfree (par défaut : 3000)}}"></i></sup>
            </label>
            <div class="col-md-2">
                <input type="number" class="configKey form-control" data-l1key="airfree_port" placeholder="3000" />
            </div>
        </div>
        <div class="form-group">
            <label class="col-md-4 control-label">{{IDs des Systèmes (Groupes) à interroger}}
                <sup><i class="fas fa-question-circle tooltips" title="{{Liste des systemID séparés par des virgules (ex: 1,3). Utilisé lorsque systemID=0 n'est pas supporté par le firmware.}}"></i></sup>
            </label>
            <div class="col-md-4">
                <input type="text" class="configKey form-control" data-l1key="airfree_systems" placeholder="1,3" />
            </div>
        </div>
        <div class="form-group">
            <label class="col-md-4 control-label">{{Nom de l'installation}}
                <sup><i class="fas fa-question-circle tooltips" title="{{Nom affiché dans le panneau graphique (ex: Bureaux ou Maison LM)}}"></i></sup>
            </label>
            <div class="col-md-4">
                <input type="text" class="configKey form-control" data-l1key="airfree_install_name" placeholder="Bureaux" />
            </div>
        </div>
        <div class="form-group">
            <label class="col-md-4 control-label">{{Localisation de l'installation}}</label>
            <div class="col-md-4">
                <input type="text" class="configKey form-control" data-l1key="airfree_install_location" placeholder="Montpellier, Hérault" />
            </div>
        </div>
        <div class="form-group">
            <label class="col-md-4 control-label">{{Actions rapides}}</label>
            <div class="col-md-6">
                <a class="btn btn-info" id="bt_testAirfreeConn"><i class="fas fa-plug"></i> {{Tester la connexion}}</a>
                <a class="btn btn-success" id="bt_syncAirfreeZones"><i class="fas fa-sync"></i> {{Découvrir & Synchroniser les zones}}</a>
            </div>
        </div>
    </fieldset>
</form>

<script>
$('#bt_testAirfreeConn').off('click').on('click', function () {
    $.ajax({
        type: 'POST',
        url: 'plugins/airfree/core/ajax/airfree.ajax.php',
        data: {
            action: 'testConnection',
            ip: $('.configKey[data-l1key=airfree_ip]').val(),
            port: $('.configKey[data-l1key=airfree_port]').val(),
            systems: $('.configKey[data-l1key=airfree_systems]').val()
        },
        dataType: 'json',
        error: function (request, status, error) {
            handleAjaxError(request, status, error);
        },
        success: function (data) {
            if (data.state !== 'ok') {
                $('#div_alert').showAlert({message: data.result, level: 'danger'});
                return;
            }
            $('#div_alert').showAlert({message: '{{Connexion réussie : }} ' + data.result.summary, level: 'success'});
        }
    });
});

$('#bt_syncAirfreeZones').off('click').on('click', function () {
    $.ajax({
        type: 'POST',
        url: 'plugins/airfree/core/ajax/airfree.ajax.php',
        data: {
            action: 'synchronize'
        },
        dataType: 'json',
        error: function (request, status, error) {
            handleAjaxError(request, status, error);
        },
        success: function (data) {
            if (data.state !== 'ok') {
                $('#div_alert').showAlert({message: data.result, level: 'danger'});
                return;
            }
            $('#div_alert').showAlert({message: '{{Synchronisation terminée : }} ' + data.result.count + ' {{zones synchronisées.}}', level: 'success'});
        }
    });
});
</script>
