/**
 * Entrée Mobile Jeedom pour Airfree Local API
 * Charge et initialise l'application tactile responsive AirfreeApp
 */
function initAirfreeAirfree() {
  if (window.AirfreeApp) {
    window.AirfreeApp.init();
  } else {
    var script = document.createElement('script');
    script.src = 'plugins/airfree/desktop/js/airfree.js';
    script.onload = function () {
      if (window.AirfreeApp) {
        window.AirfreeApp.init();
      }
    };
    document.head.appendChild(script);
  }
}
initAirfreeAirfree();
