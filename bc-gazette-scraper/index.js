const fs = require('fs');
const axios = require('axios');
// const { Parser } = require('json2csv');
const { Parser, transforms: { unwind, flatten } } = require('json2csv');
const forfeitureScraper = require('./scripts/forfeiture-scraper');


// DATA IMPORTS
let urls = ['https://www.bclaws.gov.bc.ca/civix/content/bcgaz1/bcgaz1/?xsl=/templates/browse.xsl']; // URL to scrape
const gazette_all = require('./data/gazette-all.json');
const gazette_annual = require('./data/gazette-annual.json');
const gazette_weekly = require('./data/gazette-weekly.json');
const gazette_cf = require('./data/gazette-cf.json');

// VARS
const useCheerio = true;
const filename = 'data'; // temp file for data
const testfile = 'test-data.csv'; // temp file for data
const data_dir = 'data';

// KICK IT OFF!!!
// urls = gazette_annual.urls;
// urls = gazette_weekly.urls.filter(d => d.title === 'Ministry of Public Safety and Solicitor General');
urls = gazette_cf.urls.slice(-2); //.slice(0,1);
downloadHTML(urls);


// GET LATEST AF NOTICES
/*
	1. GRAB OUR LIST OF URLS THAT HAVE BEEN SCRAPED
	2. GET LIST OF LATEST WEEKLY NOTICES
	3. COMPARE & FIGURE OUT WHICH NOTICES ARE NEW
	4. DOWNLOAD & SCRAPE THE NEW NOTICES
	5. ADD LATEST URL(S) TO LIST OF URLS THAT HAVE BEEN SCRAPED
*/



async function downloadHTML(urls) {
	let html;
	// get first url in the list
	let url = urls.shift();
	url = url.url;
	// clean it up a bit to use as a filename
	const cleanUrl = url.split('//')[1].replace(/\//g, '_');
	const htmlFilename = `${__dirname}/${data_dir}/html-pages/${cleanUrl}.html`;

	
	// check if we already have the file downloaded
	const fileExists = fs.existsSync(htmlFilename);
	
	if (!fileExists) {
		// download the HTML from the web server
		console.log(`Downloading HTML from ${url}...`);
		
		// fetchDeaths & fetchCases & other files
		html = await axios.get(url);
		
		// save the HTML to disk
		try {
			await fs.promises.writeFile(htmlFilename, html.data);

			console.log('done!')
		} catch(err) { 
			console.log(err);
		}
	} else {
		console.log(`Skipping download for ${url} since ${cleanUrl} already exists.`);
	}
	
	// load local copy of html
	html = await fs.readFileSync(htmlFilename);

	// scrape downloaded file
	const results = await forfeitureScraper(html);

	// if there's more links, let's do it again!
	if(urls.length > 0) {
		console.log('Downloading next url...');
		downloadHTML(urls);
	} else {
		// saveData(results, filename);
	}
	saveData(results, testfile);
}

function saveData(data, filename) {
	console.log(`Saving data to ${filename}`);

	try {
		// const parser = new Parser(); // sanity check that we have the right number of seizures
		// expand the seizures out so there is one row per item seized
		const parser = new Parser({transforms: [unwind({ paths: ['seized'] })]});
		fs.writeFileSync(`${__dirname}/${data_dir}/${filename}`, parser.parse(data));
	} catch (err) {
		console.error(err);
	}
}

