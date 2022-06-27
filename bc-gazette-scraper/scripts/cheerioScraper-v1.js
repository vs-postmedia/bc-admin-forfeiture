const cheerio = require('cheerio');

// VARS
let obj = {};
let cfo_data = [];
let data = {urls:[]};
let scraper_version = 1;
const url_frag = 'https://www.bclaws.gov.bc.ca/civix/content/bcgaz1/bcgaz1/';

async function cheerioScraper(html) {
	let address, agency, city, cfo_file, date, police_file;
	const $ = cheerio.load(html);

	// do some scraping
	// console.log('Oh, I do say, cheerio, good sir!');

	// we only want files from 2011 on, since that's when admin CF started
	const gazette_date = $('body > table > tbody > tr:nth-child(2) > td > table > tbody > tr > td:nth-child(1) > font').html().split('<br>')[1].trim();
	const gazette_year = gazette_date.split(', ')[1];


	console.log(gazette_date);

	// page format changes depending on date
	if (gazette_date === 'June 20, 2019') {
		scraper_version = 2;
	}

	if (scraper_version === 2) {
		$('body p').each((i,d) => {
			const text = $(d).text();

			if (text.startsWith('On')) {
				// save & reset 
				cfo_data.push(obj);
				obj = {};

				// date
				obj.date = text.split(', at')[0].replace('On ', '');
				obj.year = obj.date.split(',')[1];

				// location
				address = text.split(', ')[2].replace('at ', '').trim();
				obj.city = text.split(', ')[3].replace('in ', '').trim();
				obj.location = `${address}, ${obj.city}, British Columbia`;

				console.log(obj)

				// police department
				agency = text.split(', ')[5]
					.replace('Peace Officer(s) of the ', '')
				agency = agency.replace(' seized', '');
				obj.agency = agency.trim();
			}

			if (text.startsWith('Notice is hereby')) {
				obj.cfo_file = text.split(', ')[1].split(' ')[3].trim();
				obj.police_file = 'NA';
			}
		});
	} else {
		$('body p').each((i,d) => {
			const text = $(d).text();

			// get address, city & PD
			if (text.startsWith('At') || text.startsWith('Near')) {
				// save & reset
				cfo_data.push(obj);
				obj = {};
				
				// address
				address = text.split(' B.C.')[0]
					.replace('At ', '')
					.replace('Near ', '')
				address = address.replace('or near the ', '');
				address = address.replace('or near ', '');
				address = address.replace('the ', '').trim();

				// city
				obj.city = text.split(', ')[1].trim();

				// police department
				agency = text.split('Peace Officer(s) of the ')[1]

				// agency = agency.split(' seized')[0];
				agency = agency.trim();

				// add everything to the cfo object
				obj.agency = agency;
				// obj.date = gazette_date;
				obj.location = `${address}, ${obj.city}, British Columbia`;

			}

			if (text.startsWith('-')) {
				obj.date = text.split('on ')[1];

				if (obj.date !== undefined) {
					obj.year = obj.date.split('-')[0];	
				}
			}

			if (text.startsWith('CFO')) {
				console.log(text)
				obj.cfo_file = text.split(' ')[3].replace(';', '').trim();
				obj.police_file = text.split(' ')[4].replace('.', '').trim();
			}
		});
	}

	return cfo_data;
}

// get pages for list of all, annual, weekly and ministry lists of gazettes
async function gazette_lists(html) {
	let data = {urls:[]};
	const $ = cheerio.load(html);

	// do some scraping
	console.log('Oh, I do say, cheerio, good sir!');

	const list = $('.main-content ul.search-results > li > a');
	
	// console.log(list.text())

	$(list).each((i,d) => {
		data.urls.push({
			title: $(d).text(),
			url: url_frag + $(d).attr('href')
		});
	});

	return data;
}

module.exports = cheerioScraper;