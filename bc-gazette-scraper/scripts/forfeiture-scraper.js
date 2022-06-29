const cheerio = require('cheerio');
const { filter } = require('cheerio/lib/api/traversing');

// VARS
let cfo_data = [];
let scraper_version;

// document structure changes on this date
const v1_cutoff_ts = new Date('June 20, 2019').getTime() / 1000;
const v1_1_cutoff_ts = new Date('June 22, 2017').getTime() / 1000;
const v1_1_cutoff_ts_end = new Date('February 9, 2017').getTime() / 1000;

async function forfeitureScraper(html) {
	const $ = cheerio.load(html);

	// do some scraping
	// console.log('Oh, I do say, cheerio, good sir!');

	// get the publication date of the gazette
	let gazette_date = $('body > table > tbody > tr:nth-child(2) > td > table > tbody > tr > td:nth-child(1) > font').html().split('<br>')[1].trim();
	const gazette_ts = new Date(gazette_date).getTime() / 1000;
	console.log(gazette_date)

	// page layout changes on certain dates
	if (gazette_ts <= v1_1_cutoff_ts && gazette_ts > v1_1_cutoff_ts_end) {
		scraper_version = 1_1;
	} else if (gazette_ts <= v1_cutoff_ts) {
		scraper_version = 1;
	} else {
		scraper_version = 2;
	}

	if (scraper_version === 1) {
		console.log('Scraper V1');
		gazetteScraperV1($, gazette_date, scraper_version);
	} else if (scraper_version === 1_1) {
		console.log('Scraper V1.1');
		gazetteScraperV1_1($, gazette_date, scraper_version);
	} else {
		console.log('Scraper V2');
		gazetteScraperV2($, gazette_date, scraper_version);
	}

	// console.log(cfo_data)
	return cfo_data;
}

function gazetteScraperV1_1($, gazette_date, scraper_version) {
	// get all the copy & put it in an array
	// several seizure notices aren't contained in any kind of <tag> at all. sigh.
	const body_text_array = $('body').text().split('\n');

	// lets get parsing some text!!!
	body_text_array.forEach(d => {
		let offense, seized_goods;
		
		// skip rows that aren't seizure notices
		if (d.includes('NOTICE IS HEREBY GIVEN THAT:') && d.length > 135) {
			// parse out the chunk of text we actually need
			const text = d.split('/civilforfeiture. ')[1] || d.split('THAT: ')[1];

			// police department
			let agency = text.split('Peace Officer(s) of the')[1].split('seized')[0].trim();

			// CFO file number
			let cfo_file = text.split('CFO file Number: ')[1];
			if (cfo_file) {
				cfo_file = cfo_file.split(',')[0].replace('.', '').trim();
			}
			let police_file = 'NA';

			// Criminal code
			let offence = text.split('under section')[1];
			if (offence) {
				offence = offence.split(' of the')[0].trim();
			}

			// sometimes there are multiple dates
			const text_array = text.split('. On ');
			
			text_array.forEach(t => {
				let date, split, year

				// date
				if (t.startsWith('On')) {
					date = t.split(', at')[0].replace('On ', '');
					year = date.split(',')[1].trim();
				} else if (t.startsWith('Peace')) {
					date = t.split(': On ')[1].split(', at')[0];
					year = date.split(',')[1].trim();
				}
				
				// location
				let address = t.split(', ')[2].replace('at ', '').replace('the ', '').trim();
				let city = t.split(', ')[3].replace('in ', '').trim();
				let location = `${address}, ${city}, British Columbia`;

				// goods seized
				if (t.trim().startsWith('On')) {
					split = t.split('described as')[1].split(' The subject property')[0];
				} else if (t.startsWith('Peace')) {
					split = t.split(': ')[2];
				}
				
				if (split !== undefined) {
					// remove commas from $$
					split = split.replace(/(\d+),(\d+)/g, '$1$2')
						.split(', ');

					// filter out unneeded elements
					seized_goods = split.filter(d => !d.includes('VIN') && !d.includes('on or about') && !d.includes('BCLP') && !d.includes('subject') && !d.includes('CFO'));
				}

				// tidy up...
				seized_goods = seized_goods.map(d => {
					return d.replace('/^and/', '')
						.replace('an ', '')
						.replace('a: ', '')
						.replace('a ', '')
						.replace(': ', '')
						.replace('$', '')
						.trim()
				});

				// store
				cfo_data.push({ 
					agency: agency,
					city: city, 
					cfo_file: cfo_file, 
					gazette_date: gazette_date,
					seizure_date: date, 
					location: location,
					offence: offence,
					police_file: police_file,
					seized_goods: seized_goods,
					year: year,
					version: scraper_version
				});
			});
		}
	});
}

function gazetteScraperV1($, gazette_date, scraper_version) {
	// get all the copy & put it in an array
	// several seizure notices aren't contained in any kind of <tag> at all. sigh.
	const body_text = $('body').text();
	let body_text_array = body_text.split('\n');

	// lets get parsing some text!!!
	body_text_array.forEach(d => {
		let cfo_filed, offence, seized_goods;
		
		// skip rows that aren't seizure notices
		if (d.includes('NOTICE IS HEREBY GIVEN THAT:') && d.length > 135) {
			// parse out the chunk of text we actually need
			const text = d.split('THAT: ')[1].split(' Part 3.1')[0];
			
			// police department
			let agency = text.split('Peace Officer(s) of the')[1];
			if (agency) {
				agency = agency.split('seized')[0].trim();
			}

			// CFO file number
			let police_file = 'NA';
			if (text.includes('CFO File') || text.includes('CFO file')) {
				cfo_file = text.split('Number:')[1].replace(', is subject to forfeiture under', '').replace('.', '').trim();
			}
			
			// Criminal code
			if (text.includes('section')) {
				offence = text.split('section')[1].split(' of the')[0];
			} else if (text.includes('under ss.')) {
				offence = text.split('under ss.')[1].split('Notice')[0];
			// } else {
			// 	console.log(text)
			}

			// sometimes there are multiple dates
			const text_array = text.split('. On ');
			
			text_array.forEach(t => {
				// add to manual
				// 2016-3873
				if (t.includes('2016-4002')) { return; }

				// date
				year = t.split(',')[1].trim();
				date = `${t.split(',')[0].replace('On ', '')}, ${year}`;
				// date = t.split(', at')[0].replace('On ', '');
				// year = date.split(',')[1].trim();

				// location
				let address = t.split(', ')[2].replace('at ', '').replace('the ', '').trim();
				let city = t.split(', ')[3].replace('in ', '').trim();
				let location = `${address}, ${city}, British Columbia`;

				// goods seized
				let split = t.split('described as')[1];				
				if (split) {
					split = split.split('The subject property')[0];
				}

				if (split !== undefined) {
					// remove commas from $$
					split = split.replace(/(\d+),(\d+)/g, '$1$2')
						// sometimes they use semi-colons...
						.replace(/;/g, ',')
						.split(', ');

					// filter out unneeded elements
					seized_goods = split.filter(d => !d.includes('VIN') && !d.includes('on or about') && !d.includes('BCLP') && !d.includes('CFO') && !d.includes('subject') && !d.includes('ABLP'));
				
					// tidy up...
					seized_goods = seized_goods.map(d => {
						return d.replace('/^and/', '')
							.replace('an ', '')
							.replace('a: ', '')
							.replace('a ', '')
							.replace(': ', '')
							.replace('$', '')
							.trim()
					});
				}

				// store
				cfo_data.push({ 
					agency: agency,
					city: city, 
					cfo_file: cfo_file, 
					gazette_date: gazette_date,
					seizure_date: date, 
					location: location,
					offence: offence,
					police_file: police_file,
					seized_goods: seized_goods,
					year: year,
					version: scraper_version
				});
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
			gazette_date: 'February 25, 2016',
			seizure_date: 'June 28, 2015', 
			location: '133rd Street and 104th Avenue, Surrey, British Columbia',
			offence: 'section 5(2) (Possession for purpose of trafficking)',
			police_file: 'NA',
			seized_goods: ['2002 grey Mazda Tribute'],
			year: 2015,
			version: 'manual'
		});
	} else if (gazette_date === 'July 14, 2016') {
		cfo_data.push(
			{ 
				agency: 'Vancouver Police Department',
				city: 'Vancouver', 
				cfo_file: '2016-3873',
				gazette_date: 'July 14, 2016',
				seizure_date: 'June 11, 2016', 
				location: '400 block of Columbia Street, Vancouver, British Columbia',
				offence: 'section 5(2) (Possession for purpose of trafficking)',
				police_file: 'NA',
				seized_goods: ['$1750 CAD'],
				year: 2016,
				version: 'manual'
			},{ 
				agency: 'Vancouver Police Department',
				city: 'Vancouver', 
				cfo_file: '2016-3873',
				gazette_date: 'July 14, 2016',
				seizure_date: 'August 5, 2014', 
				location: '100 block of East Hastings Street, Vancouver, British Columbia',
				offence: 'section 5(2) (Possession for purpose of trafficking)',
				police_file: 'NA',
				seized_goods: ['$405 CAD'],
				year: 2016,
				version: 'manual'
			},{ 
				agency: 'Vancouver Police Department',
				city: 'Vancouver', 
				cfo_file: '2016-3873',
				gazette_date: 'July 14, 2016',
				seizure_date: 'August 3, 2012', 
				location: '100 block of East Hastings Street, Vancouver, British Columbia',
				offence: 'section 5(2) (Possession for purpose of trafficking)',
				police_file: 'NA',
				seized_goods: ['$235 CAD'],
				year: 2012,
				version: 'manual'
			},{ 
				agency: 'Vancouver Police Department',
				city: 'Vancouver', 
				cfo_file: '2016-3873',
				gazette_date: 'July 14, 2016',
				seizure_date: 'August 27, 2011', 
				location: '100 block of East Hastings Street, Vancouver, British Columbia',
				offence: 'section 5(2) (Possession for purpose of trafficking)',
				police_file: 'NA',
				seized_goods: ['$620.55 CAD'],
				year: 2011,
				version: 'manual'
			}
		);
	} else if (gazette_date === 'August 25, 2016') {
		cfo_data.push(
			{ 
				agency: 'Vancouver Police Department',
				city: 'Vancouver', 
				cfo_file: '2016-4002',
				gazette_date: 'August 25, 2016',
				seizure_date: 'September 18, 2009', 
				location: '3600 block of Fraser Street, Vancouver, British Columbia',
				offence: 'section 5(2) (Possession for purpose of trafficking)',
				police_file: 'NA',
				seized_goods: ['$290 CAD'],
				year: 2009,
				version: 'manual'
			},{ 
				agency: 'Vancouver Police Department',
				city: 'Vancouver', 
				cfo_file: '2016-4002', 
				gazette_date: 'August 25, 2016',
				seizure_date: 'September 26, 2012', 
				location: '100 block of Milross Avenue, Vancouver, British Columbia',
				offence: 'section 5(2) (Possession for purpose of trafficking)',
				police_file: 'NA',
				seized_goods: ['$560 CAD'],
				year: 2012,
				version: 'manual'
			},{ 
				agency: 'Vancouver Police Department',
				city: 'Vancouver', 
				cfo_file: '2016-4002', 
				gazette_date: 'August 25, 2016',
				seizure_date: 'December 27, 2014', 
				location: 'Granville Street & W. 10th Avenue, Vancouver, British Columbia',
				offence: 'section 5(2) (Possession for purpose of trafficking)',
				police_file: 'NA',
				seized_goods: ['$643.70 CAD'],
				year: 2014,
				version: 'manual'
			},{ 
				agency: 'Vancouver Police Department',
				city: 'Vancouver', 
				cfo_file: '2016-4002', 
				gazette_date: 'August 25, 2016',
				seizure_date: 'April 20, 2016', 
				location: 'Granville Street and Helmcken Street, Vancouver, British Columbia',
				offence: 'section 5(2) (Possession for purpose of trafficking)',
				police_file: 'NA',
				seized_goods: ['$170.25 CAD'],
				year: 2016,
				version: 'manual'
			}
		);
	} else if (gazette_date === 'December 8, 2016') {
		cfo_data.push(
			{ 
				agency: 'Vancouver Police Department',
				city: 'Vancouver', 
				cfo_file: '2016-4052',
				gazette_date: 'December 8, 2016',
				seizure_date: 'January 27, 2011', 
				location: '200 block of Abbott Street, Vancouver, British Columbia',
				offence: '354(1) (Possession of property obtained by crime)',
				police_file: 'NA',
				seized_goods: ['1343 CAD', '405 CAD'],
				year: 2011,
				version: 'manual'
			},{ 
				agency: 'Vancouver Police Department',
				city: 'Vancouver', 
				cfo_file: '2016-4052',
				gazette_date: 'December 8, 2016',
				seizure_date: 'June 23, 2016', 
				location: '400 block of Alexander Street, Vancouver, British Columbia',
				offence: '354(1) (Possession of property obtained by crime)',
				police_file: 'NA',
				seized_goods: ['1700 CAD'],
				year: 2016,
				version: 'manual'
			},{ 
				agency: 'Vancouver Police Department',
				city: 'Vancouver', 
				cfo_file: '2016-4052',
				gazette_date: 'December 8, 2016',
				seizure_date: 'July 6, 2016', 
				location: 'Main Street & Terminal Avenue, Vancouver, British Columbia',
				offence: '354(1) (Possession of property obtained by crime)',
				police_file: 'NA',
				seized_goods: ['815 CAD'],
				year: 2016,
				version: 'manual'
			}
		);
	}
}

function gazetteScraperV2($, gazette_date, scraper_version) {
	let seized_goods = [];
	let address, agency, city, cfo_file, date, location, offence, police_file, year;
	
	$('body p').each((i,d) => {
		const text = $(d).text();

		// locations & police department
		if (text.includes('Peace Officer(s)')) {
			// address
			address = text.split(', Peace')[0];
			// city
			city = address.split(', ')[1];
			
			if (text.startsWith('On')) {
				address = text.split(',')[2];
				city = text.split(',')[3].trim();
			}

			address = address.replace('At ', '')
				.replace('At the', '')
				.replace('at the', '')
				.replace('Near ', '')
				.replace(', B.C.', '')
				.replace(', BC', '')
				.replace('or near ', '')
				.replace('the ', '')
				.trim();
			
			location = `${address}, ${city}, British Columbia`;
			// police department
			agency = text.split('Peace Officer(s) of the ')[1];

			if (agency !== undefined) {
				agency = agency.split(' seized')[0];
			}
		}

		// date of seizure & items taken
		if (text.startsWith('-')) {
			date = text.split(' on ')[1];

			// get the date of the seizure
			if (date !== undefined) {
				date = date.split(' ')[0];
				year = date.split('-')[0];
			}
			
			// remove commas from $$
			let text_no_comma = text.replace(/(\d+),(\d+)/g, '$1$2');
			seized_goods.push(text_no_comma.split(' on ')[0].replace('-', '').trim())
		// sometimes seized items are included in the text block
		} else if (text.includes('Hours')) {
			year = text.split(',')[1];
			date = text.split(',')[0].replace('On ', '');
			date = `${date}, ${year}`;

			let goods = text
				.split(': ')[1]
				.split('on or')[0]
				.replace(/(\d+),(\d+)/g, '$1$2');
			seized_goods.push(goods);
		}

		// CFO & police file numbers
		if (text.includes('CFO file')) {
			cfo_file = text.split('Number')[1]
				.replace(': ', '')
				.replace(';', '')
				.split(' ')[0];
			police_file = text.split('Number')[1].split(' ')[2].replace('.', '').trim();
		}

		// Criminal code
		if (text.includes('under section')) {
			offence = text.split('under section')[1].trim()
		}

		// tidy up...
		seized_goods = seized_goods.map(d => {
			return d.replace('/^and/', '')
				.replace('an ', '')
				.replace('a: ', '')
				.replace('a ', '')
				.replace(': ', '')
				.replace('$', '')
				.trim()
		});

		// end forfeiture claim
		if (text.startsWith('AND:')) {
			// save & reset object  
			cfo_data.push({ 
				agency: agency,
				city: city, 
				cfo_file: cfo_file,
				gazette_date: gazette_date,
				seizure_date: date,
				location: location,
				offence: offence,
				police_file: police_file,
				seized_goods: seized_goods,
				year: year,
				version: scraper_version
			});
			// reset seized goods
			seized_goods = [];
		}
	});

	// push the final data point
	cfo_data.push({ 
		agency: agency,
		city: city, 
		cfo_file: cfo_file, 
		gazette_date: gazette_date,
		seizure_date: date, 
		location: location,
		offence: offence,
		police_file: police_file,
		seized_goods: seized_goods,
		year: year,
		version: scraper_version
	});
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