<?php

/*
 *  Instance Configuration
 *  ----------------------
 *  Edit this file and not config.php for imageboard configuration.
 *
 *  You can copy values from config.php (defaults) and paste them here.
 */
	// site icon
	$config['url_favicon'] = '/favicon.png';
	// show boardlist at top
	$config['boards'] = array(
		array('home' => 'http://h2ochan.org'),
		array('KJB' => 'http://h2ochan.org/KJB'),
		array('bt', 'eve', 'wah')
	);
	$config['page_nav_top'] = true;
	// bible hosting
	$config['bible']['path_full'] = 'static/bible/eng-kjv.osis.xml';
	$config['bible']['path_index'] = 'tmp/index-eng-kjv.osis.xml';

	// Database stuff
	$config['db']['type']		= 'mysql';
	$config['db']['server']		= 'localhost';
	$config['db']['user']		= '';
	$config['db']['password']	= '';
	$config['db']['database']	= '';
	
	// save post to cookie
	$config['additional_javascript'][] = 'js/bookmark.js';

	// bible scrolling
	$config['additional_javascript'][] = 'js/bible-infinite-scroll.js';

	// id colors
	$config['additional_javascript'][] = 'js/id_colors.js';
	$config['additional_javascript'][] = 'js/id_highlighter.js';
	
	@include('inc/secrets.php'); // Config edits go THERE!!! 
?>
