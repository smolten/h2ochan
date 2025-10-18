<?php

/*
 *  Instance Configuration
 *  ----------------------
 *  Edit this file and not config.php for imageboard configuration.
 *
 *  You can copy values from config.php (defaults) and paste them here.
 */
	// site icon
	$config['url_favicon'] = '/templates/themes/index/h2ofavicon.png';
	// show boardlist at top
	$config['boards'] = array(
		array('home' => 'http://h2ochan.org'),
		array('bt', 'wah')
	);
	// bible hosting
	$config['bible']['path_full'] = 'static/bible/eng-kjv.osis.xml';
	$config['bible']['path_index'] = 'tmp/index-eng-kjv.osis.xml';

	// Database stuff
	$config['db']['type']		= 'mysql';
	$config['db']['server']		= 'localhost';
	$config['db']['user']		= '';
	$config['db']['password']	= '';
	$config['db']['database']	= '';
	
	//$config['root']				= '/';
	
	@include('inc/secrets.php');
?>
