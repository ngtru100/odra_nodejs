// Bibliotheken
// fetch für Web-Request
const fetch = require('node-fetch');
// JSDOM zum parsen des HTMLs zu einem JavaScript Objekt
const jsdom = require('jsdom').JSDOM;
// MomentJS zum korrekten parsen vom Datum
const moment = require('moment');
// fs-extra um die JSON Dateien auf die Platte zu schreiben
const fs = require('fs-extra');

const http = require('http');

// Eine JavaScript-Klasse mit den Inhalten der Seite
class Article {
  constructor(obj) {
    // Überschrift des Artikels
    this.headline = obj.headline || '';
    // Content des Artikels (nur Text und HTML)
    this.textBody = obj.textBody || '';
    // URL des Mediums
    this.source = obj.source || '';
    // Name des Mediums
    this.sourceName = obj.sourceName || '';
    // Name des Autors / der Autorin (falls vorhanden)
    this.author = obj.author || '';
    // Ressort des Artikels (falls ermittelbar)
    this.topic = obj.topic || '';
    // URL des Artikels
    this.link = obj.link || '';
    // genaues Crawl-Datum
    this.crawlDate = obj.crawlDate || 0;
    // Datum der Artikelerstellung (wenn vorhanden)
    this.creationDate = obj.creationDate || 0;
  }
}

// Hilfsfunktion um den Seiteninhalt zu holen mithilfe von fetch
// https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
const getPageContent = async url =>
  await fetch(url)
    .then(res => res.text())
    .then(text => text);

// https://www.dziennik.pl/
const processDziennik = async () => {
  // Hole Startseite
  const homepageContent = await getPageContent('https://www.dziennik.pl/');
  const { document } = new jsdom(homepageContent).window;
  const articleRegex = new RegExp(/https:\/\/\w+.dziennik.pl\/\w+\/artykuly\/\d+/gi);

  // Suche auf der Startseite alle URLs die dem RegEx entsprechen
  let articles = [...document.body.querySelectorAll('a')]
    .filter(link => link.href.match(articleRegex))
    .map(link => link.href);
  // Entferne doppelte URLs
  articles = Array.from(new Set(articles));
  // Behalte nur die obersten 20 URLs
  articles = articles.slice(0, 20);

  // Funktion um einen Artikel über URL zu parsen
  const getArticle = async url =>
    getPageContent(url).then(article => {
      // Seiteninhalt parsen und als Document bekommen
      // https://developer.mozilla.org/en-US/docs/Web/API/Document
      const { body } = new jsdom(article).window.document;

      // Wähle über CSS-Selektoren die richtigen Felder aus (falls vorhanden)
      // und extrahiere ihren Textinhalt
      const headline = body.querySelector('h1.mainTitle')
        ? body.querySelector('h1.mainTitle').textContent.trim()
        : '';

      const subtitle = body.querySelector('#lead') ? body.querySelector('#lead').textContent.trim() : '';
      const content = body.querySelectorAll('div#detail > p,h1,h2,h3,h4,h5,h6')
        ? [...body.querySelectorAll('div#detail > p,h1,h2,h3,h4,h5,h6')]
          .map(p => p.textContent.trim())
          .join('\n')
          .trim()
        : '';
      const textBody = `${subtitle}\n${content}`.trim();

      const author = body.querySelector('div.authDesc.authDesc1 > a > span')
        ? body.querySelector('div.authDesc.authDesc1 > a > span').textContent
        : 'UNKNOWN';

      // Thema der URL entnehmen mittels RegEx und einer Capture Group
      const topic = url.match(/.*dziennik.pl\/(\w+)\/artykuly\/\d+/)[1] || '';
      // Datum mit MomentJS richtig parsen
      // const creationDate = moment(body.querySelector('time').textContent, 'DD.MM.YYYY, HH:mm').valueOf();
      let creationDate = 0;
      if (body.querySelector('time.datePublished')) {
        const dateString = body.querySelector('time.datePublished').textContent.trim();
        const split = dateString.split(' ');
        const month = moment.localeData('pl').monthsParse(split[1]) + 1;

        creationDate = moment(
          `${split[0]}.${month}.${split[2]}`,
          'DD.M.YYYY',
        ).valueOf();
      }

      // Neue Instanz der Klasse Article zurückgeben mit neu erfassten Inhalten
      return new Article({
        headline,
        textBody,
        topic,
        link: url,
        creationDate,
        author,
        source: 'https://www.dziennik.pl/',
        sourceName: 'Dziennik.PL',
        crawlDate: Date.now(),
      });
    });

  // Iteriere über alle Artikel
  // parsed ist jetzt ein Array bestehend aus 20 Instanzen der Klasse Article (siehe oben)
  const parsed = await Promise.all(articles.map(url => getArticle(url)));

  // Schreibe den Inhalt von parsed als JSON
  fs.writeJsonSync('./dziennik.json', parsed);

  return parsed;
};

// https://www.kontextwochenzeitung.de/
const processKontext = async () => {
  const homepageContent = await getPageContent('https://www.kontextwochenzeitung.de/');
  const { document } = new jsdom(homepageContent).window;
  const articleRegex = new RegExp(/https:\/\/www.kontextwochenzeitung.de\/(\w+)\/.*.html/gi);

  let articles = [...document.body.querySelector('.news-list-view').querySelectorAll('a')]
    .filter(link => link.href.match(articleRegex))
    .map(link => link.href);
  articles = Array.from(new Set(articles));
  articles = articles.slice(0, 20);

  const getArticle = async url =>
    getPageContent(url).then(article => {
      const { body } = new jsdom(article).window.document;

      const headline = body.querySelector('div.header h1') ? body.querySelector('div.header h1').textContent.trim() : '';

      const subtitle = body.querySelector('div.teaser-text') ? body.querySelector('div.teaser-text').textContent.trim() : '';
      const content = [...body.querySelectorAll('div.bodytext.margin-singlebodytext *')]
        .filter(article => article !== undefined)
        .map(article => article.textContent.trim())
        .join('\n')

      const textBody = `${subtitle}\n${content}`.trim();

      const author = body.querySelector('.document-info .author')
        ? body.querySelector('.document-info .author').textContent
        : '';

      const topic = url.match(/https:\/\/www.kontextwochenzeitung.de\/(\w+)\/.*.html/)[1] || '';
      const creationDate = moment(
        body
          .querySelector('.document-info .datum')
          .textContent.split(':')[1]
          .trim(),
        'DD.MM.YYYY',
      ).valueOf();

      return new Article({
        headline,
        textBody,
        topic,
        link: url,
        creationDate,
        author,
        source: 'https://www.kontextwochenzeitung.de/',
        sourceName: 'KONTEXT: Wochenzeitung',
        crawlDate: Date.now(),
      });
    });

  const parsed = await Promise.all(articles.map(url => getArticle(url)));

  fs.writeJsonSync('./kontext.json', parsed);

  return parsed;
};

http.createServer(async (request, response) => {
  let body = {};
  if (request.url === '/kontext') {
    body = await processKontext();
  } else if (request.url === '/dziennik') {
    body = await processDziennik();
  } else {
    body = {
      status: 'error',
      message: `wrong url ${request.url}`
    };
  }
  response.writeHead(200, {
    'Content-Type': 'application/json'
  }).end(Buffer.from(JSON.stringify(body)));
}).listen(12345, () => console.log('Listening on port 12345'));
