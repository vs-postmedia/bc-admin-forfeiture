const cheerio = require('cheerio');
const { filter } = require('cheerio/lib/api/traversing');

// VARS
// let obj = {};
let cfo_data = [];
let scraper_version;
// let address, agency, city, cfo_file, date, police_file, seized_goods, year;

// document structure changes on this date
const v1_cutoff_ts = new Date('June 20, 2019').getTime() / 1000;

// let data = {urls:[]};
// const url_frag = 'https://www.bclaws.gov.bc.ca/civix/content/bcgaz1/bcgaz1/';

async function forfeitureScraper(html) {
	const $ = cheerio.load(html);

	// do some scraping
	console.log('Oh, I do say, cheerio, good sir!');

	// get the publication date of the gazette
	let gazette_date = $('body > table > tbody > tr:nth-child(2) > td > table > tbody > tr > td:nth-child(1) > font').html().split('<br>')[1].trim();
	console.log(gazette_date)
	const gazette_ts = new Date(gazette_date).getTime() / 1000;

	// page layout changes on certain date(s)
	if (gazette_ts <= v1_cutoff_ts) {
		scraper_version = 1;
	} else {
		scraper_version = 2;
	}

	if (scraper_version === 1) {
		console.log('Scraper V1');
		gazetteScraperV1($, gazette_date, scraper_version);
	} else {
		console.log('Scraper V2');
		gazetteScraperV2($, gazette_date, scraper_version);
	}

	console.log(cfo_data)
	return cfo_data;
}

function gazetteScraperV1($, gazette_date, scraper_version) {
	// get all the copy & put it in an array
	// several seizure notices aren't contained in any kind of <tag> at all. sigh.
	const body_text = $('body').text();
	let body_text_array = body_text.split('\n');

	// lets get parsing some text!!!
	body_text_array.forEach(d => {
		// skip rows that aren't seizure notices
		if (d.includes('NOTICE IS HEREBY GIVEN THAT:') && d.length > 35) {
			// parse out the chunk of text we actually need
			const text = d.split('THAT: ')[1].split(' Part 3.1')[0];

			// police department
			// let agency = text.split(', ')[5].replace('Peace Officer(s) of the ', '');
			let agency = text.split('Peace Officer(s) of the')[1].split('seized')[0].trim();
			// agency = agency.replace(' seized', '').trim();

			// CFO file number
			let cfo_file = text.split('CFO file Number: ')[1].split(',')[0].trim();
			let police_file = 'NA';

			// Criminal code
			let offence = text.split('under section')[1].split(' of the')[0].trim();

			// sometimes there are multiple dates
			const text_array = text.split('. On ');
			
			text_array.forEach(t => {
				// date
				date = t.split(', at')[0].replace('On ', '');
				year = date.split(',')[1].trim();

				// location
				let address = t.split(', ')[2].replace('at ', '').replace('the ', '').trim();
				let city = t.split(', ')[3].replace('in ', '').trim();
				let location = `${address}, ${city}, British Columbia`;

				// goods seized
				let split = t.split('described as:')[1].split(' The subject property')[0];

				if (split !== undefined) {
					// remove commas from $$
					split = split.replace(/(\d+),(\d+)/g, '$1$2')
						.split(', ');

					// filter out unneeded elements
					seized_goods = split.filter(d => !d.includes('VIN') && !d.includes('on or about') && !d.includes('BCLP'));
				}
				
				// this doesn't work for some reason...
				seized_goods.forEach(d => {
					d.replace('and ', '')
						.replace('an ', '')
						.replace('a ', '')
						.trim()
				});

				// put it all together 
				const obj = { 
					agency: agency,
					city: city, 
					cfo_file: cfo_file, 
					date: date, 
					location: location,
					offence: offence,
					police_file: police_file,
					seized_goods: seized_goods,
					year: year,
					version: scraper_version
				};
						
				// store
				cfo_data.push(obj);
			});
		}
	});

	// edge cases... ugh
	if (gazette_date === 'February 25, 2016') {
		// put it all together 
		cfo_data.push({ 
			agency: 'Surrey RCMP',
			city: 'Surrey', 
			cfo_file: '2016-3469', 
			date: 'June 28, 2015', 
			location: '133rd Street and 104th Avenue, Surrey, British Columbia',
			offence: 'section 5(2) (Possession for purpose of trafficking)',
			police_file: 'NA',
			seized_goods: ['2002 grey Mazda Tribute'],
			year: 2015,
			version: 'manual'
		});
	}
}

function gazetteScraperV2($, gazette_date, scraper_version) {
	$('body p').each((i,d) => {
		// date of publication in B.C. Gazette
		obj.gazette_date = gazette_date;
		const text = $(d).text();

		// save & reset object
		if (text.startsWith('AND:')) {
			cfo_data.push(obj);
			obj = {};
			seized_goods = [];
			obj.version = scraper_version;
		}

		// location
		if (text.startsWith('At') || text.startsWith('Near')) {	
			// address
			address = text.split(' B.C.')[0]
				.replace('At ', '')
				.replace('Near ', '')
			address = address.replace('or near the ', '');
			address = address.replace('or near ', '');
			address = address.replace('the ', '').trim();

			// console.log(address)

			// city
			obj.city = text.split(', ')[1].trim();
			obj.location = `${address} British Columbia`;
		}

		// police department
		if (text.includes('Peace Officer(s)')) {
			// police department
			agency = text.split('Peace Officer(s) of the ')[1];

			if (agency !== undefined) {
				obj.agency = agency.split(' seized')[0];
			}
		}

		// date of seizure & items taken
		if (text.startsWith('-')) {
			obj.date = text.split(' on ')[1];

			// get the date of the seizure
			if (obj.date !== undefined) {
				obj.date = obj.date.split(' ')[0];
				obj.year = obj.date.split('-')[0];
			}

			seized_goods.push(text.split(' on ')[0].replace('-', '').trim())
			obj.seized = seized_goods;
		}

		// CFO & police file numbers
		if (text.startsWith('CFO')) {
			obj.cfo_file = text.split(' ')[3].replace(';', '').trim();
			obj.police_file = text.split(' ')[4].replace('.', '').trim();
		}

		// Criminal code
		if (text.includes('under section')) {
			obj.offence = text.split('under section')[1].trim()
		}
	});

	// push the final data point
	cfo_data.push(obj);
}


// // get pages for list of all, annual, weekly and ministry lists of gazettes
// async function gazette_lists(html) {
// 	let data = {urls:[]};
// 	const $ = cheerio.load(html);

// 	// do some scraping
// 	console.log('Oh, I do say, cheerio, good sir!');

// 	const list = $('.main-content ul.search-results > li > a');
	
// 	// console.log(list.text())

// 	$(list).each((i,d) => {
// 		data.urls.push({
// 			title: $(d).text(),
// 			url: url_frag + $(d).attr('href')
// 		});
// 	});

// 	return data;
// }

module.exports = forfeitureScraper;