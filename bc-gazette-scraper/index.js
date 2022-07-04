const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const { Parser, transforms: { unwind, flatten } } = require('json2csv');
const urlScraper = require('./scripts/url-scraper');
const forfeitureScraper = require('./scripts/forfeiture-scraper');
const gazette_cf_urls = require('./data/gazette_cf.json');




// VARS
const data_dir = 'data';
const filename = 'data.csv'; // temp file for data
const testfile = 'test-data.csv'; // temp file for data
const selector_url_list = '.main-content > ul > li > a';
// selector for "civil forfeiture" link: sometimes fofeiture is capitalized, other times not... <rolling_eyes>
const cfo_selector = '.main-content > ul a:contains("orfeiture")';
// selector for PSSG link
const pssg_selector = '.main-content > ul a:contains("Ministry of Public Safety and Solicitor General")';
const current_year = new Date().getFullYear();
const cfo_url_frag = 'https://www.bclaws.gov.bc.ca';
const url_frag = 'https://www.bclaws.gov.bc.ca/civix/content/bcgaz1/bcgaz1/';
const url_annual = 'https://www.bclaws.gov.bc.ca/civix/content/bcgaz1/bcgaz1/?xsl=/templates/browse.xsl'; // url with links to annual gazette

// KICK IT OFF!!!
// urls = gazette_cf.urls; //.slice(-2); //.slice(0,1);
// downloadHTML(urls);

init();

// GET LATEST AF NOTICES
/*
	1. GRAB OUR LIST OF URLS THAT HAVE BEEN SCRAPED
	2. GET LIST OF LATEST %WEEKLY NOTICES
	3. COMPARE & FIGURE OUT WHICH NOTICES ARE NEW
	4. DOWNLOAD & SCRAPE THE NEW NOTICES
	5. ADD LATEST URL(S) TO LIST OF URLS THAT HAVE BEEN SCRAPED
*/

async function init() {
	console.log('start it up!')
	// get annual gazette list urls
	const annual_urls = await getUrlList(url_annual, selector_url_list);

	// we only need the latest year
	const url_list = annual_urls.filter(d => d.title.includes(current_year));

	// const url_list = annual_urls.filter(d => {
	// 	d.year = parseInt(d.title.slice(-4));
	// 	// CFO started publishing AFs to gazette in 2016
	// 	return d.year == 2016 ? d : null;
	// });

	// for each year, get the url list for weekly forfeiture announcements
	const cf_urls = await Promise.all(url_list.map(d => getWeeklyUrls(d)));

	// merge new urls into master list...
	const new_cf_urls = [...new Set(gazette_cf_urls.concat(cf_urls[0]))];

	// ...& save weekly forfeiture urls to disk
	saveData(new_cf_urls, 'gazette_cf.json', 'json');
}

async function getWeeklyUrls(data) {
	const weekly_urls = await getUrlList(data.url, selector_url_list);

	// get the PSSG urls
	const pssg_urls = await Promise.all(weekly_urls.map(d => getUrl(d.url, pssg_selector, url_frag)));

	// get the weekly forfeiture URLs
	const cf_urls = await Promise.all(pssg_urls.map(d => getUrl(d, cfo_selector, cfo_url_frag)));

	// return a useful object
	return cf_urls.map((d,i) => { 
		return {
			year: parseInt(data.title.slice(-4)),
			date: weekly_urls[i].title,
			url: d
		}
	});
}

function delay(ms) {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

async function getUrl(url, selector, url_frag) {
	let selected_url, title;
	try {
		const html = await axios.get(url);
		const $ = await cheerio.load(html.data);
		selected_url = $(selector).attr('href');
		title = $(selector).text();
	} catch(err) {
		console.log(err);
	}

	// 502 errors if we hit the website too fast
	delay(1000);

	return url_frag + selected_url;
}

async function getUrlList(url, selector) {
	const urls = [];
	try {
		let html = await axios.get(url);
		const $ = await cheerio.load(html.data);
		const list = $(selector);

		$(list).each((i,d) => {
			urls.push({
				title: $(d).text(),
				url: url_frag + $(d).attr('href')
			});
		});
	} catch(err) { 
		console.log(err);
	}

	return urls;
}

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

			console.log('Saved!')
		} catch(err) { 
			console.log(err);
		}
	} else {
		// console.log(`Skipping download for ${url} since ${cleanUrl} already exists.`);
	}
	
	// load local copy of html
	html = await fs.readFileSync(htmlFilename);

	// scrape downloaded file
	const results = await forfeitureScraper(html);

	// if there's more links, let's do it again!
	if(urls.length > 0) {
		// console.log('Downloading next url...');
		downloadHTML(urls);
	} else {
		saveData(results, filename);
	}
}

function saveData(data, filename, filetype) {
	console.log(`Saving data to ${filename}`);

	try {
		if (filetype === 'json') {
			fs.writeFileSync(`${__dirname}/${data_dir}/${filename}`, JSON.stringify(data));
		} else {
			// save a json for troubleshooting
			fs.writeFileSync(`${__dirname}/${data_dir}/data.json`, JSON.stringify(data));

			// expand the seizures out so there is one row per item seized
			const parser = new Parser({transforms: [unwind({ paths: ['seized_goods'] })]});
			fs.writeFileSync(`${__dirname}/${data_dir}/${filename}`, parser.parse(data));
		}
	} catch (err) {
		console.error(err);
	}
}

