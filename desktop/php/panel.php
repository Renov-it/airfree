<?php
if (!isConnect()) {
    throw new Exception('{{401 - Accès non autorisé}}');
}
include_file('desktop', 'airfree', 'css', 'airfree');
?>
<div id="airfree-app-root"></div>
<?php
include_file('desktop', 'airfree', 'js', 'airfree');
?>
