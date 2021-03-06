'use strict';
// ----------------------------------------------
// LIBRARIES AND DECLARATIONS
// ----------------------------------------------
require('dotenv').config();

const express = require('express');
const superagent = require('superagent');
const cors = require('cors');
const morgan = require('morgan');

// --- This code is required in order to make it deployable --- //
// --- However it will break in local production. Has something to do with ssl
const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});
// ------------------------------------------------------------- //
// const pg = require('pg');
// const client = new pg.Client(process.env.DATABASE_URL);

const app = express();
const PORT = process.env.PORT;
const override = require('method-override');

app.set('view engine', 'ejs');
app.use(cors());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('./public'));
app.use(override('_method'));

// ----------------------------------------------
// ROUTES
// ---------------------------------------------
app.get('/', handleHome);
app.get('/render-results', renderResults);
app.post('/render-details', renderDetail);
app.post('/add-ratings', addRatings);
app.get('/render-about', renderAbout);

app.use('*', handleNotFound);
app.use(handleError);

// ----------------------------------------------
// ROUTE HANDLER FUNCTIONS
// ----------------------------------------------

function handleHome(req, res, next) {
  try {
    res.status(200).render('pages/index');
  } catch (e) {
    next(e);
  }
}

function renderAbout(req, res, next) {
  try {
    res.status(200).render('pages/about');
  } catch (error) {
    next(error);
  }
}

async function renderResults(req, res, next) {
  try {
    const searchQuery = req.query.searchQuery;
    const API = `https://api.yelp.com/v3/businesses/search`;

    let queryObject = {
      categories: 'dog_parks',
      sort_by: 'distance',
      location: searchQuery,
      limit: 12,
    };

    let result = await superagent
      .get(API)
      .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
      .query(queryObject);
    let apiData = result.body.businesses.map((park) => new Park(park));
    res.status(200).render('pages/results', {
      parkArr: apiData,
      searchQuery: searchQuery,
    });
  } catch (error) {
    next(error);
  }
}

async function renderDetail(req, res, next) {
  try {
    let SQL = `SELECT * FROM parks_table WHERE yelp_id=$1`;
    let values = [req.body.yelp_id];
    let results = await client.query(SQL, values);
    if (results.rowCount === 0) {
      createParkRating(req, res, next);
    } else {
      helpRenderDetails(req, res, results, next);
    }
  } catch (error) {
    next(error);
  }
}

async function createParkRating(req, res, next) {
  try {
    let SQL = `INSERT INTO parks_table (yelp_id, park_name, total_ratings, total_votes)  VALUES ($1, $2, $3, $4) RETURNING *;`;
    let safequery = [req.body.yelp_id, req.body.name, 0, 0];
    let results = await client.query(SQL, safequery);
    helpRenderDetails(req, res, results, next);
  } catch (error) {
    next(error);
  }
}

async function addRatings(req, res, next) {
  try {
    let SQL = ` UPDATE parks_table
    SET total_ratings = $1, total_votes = $2
    WHERE yelp_id = $3
    RETURNING * `;
    let newTotalRatings = +req.body.total_ratings + +req.body.rating;
    let newTotalVotes = +req.body.total_votes + 1;
    let params = [newTotalRatings, newTotalVotes, req.body.yelp_id];

    let results = await client.query(SQL, params);
    helpRenderDetails(req, res, results);
  } catch (error) {
    next(error);
  }
}

///////////////////////////////////////////
async function helpRenderDetails(req, res, psqlResults, next) {
  try {
    let APIresult = await makeMultipleAPIcalls(req.body.address);
    let average =
      psqlResults.rows[0].total_ratings / psqlResults.rows[0].total_votes || 0;

    res.status(200).render('pages/details', {
      lat: req.body.lat,
      lng: req.body.long,
      ratings: psqlResults.rows[0],
      average1: average.toFixed(1),
      image_url: req.body.image_url,
      name: req.body.name,
      address: req.body.address,
      yelp_id: req.body.yelp_id,
      foodTruckArr: APIresult.foodtruck1,
      groomersArr: APIresult.groomer1,
      vetsArr: APIresult.vets1,
      dogDayCareArr: APIresult.dogDayCare1,
    });
  } catch (error) {
    next(error);
  }
}

async function makeMultipleAPIcalls(location) {
  try {
    let API1 = 'https://api.yelp.com/v3/businesses/search';

    let queryFoodTruck = {
      term: 'food truck',
      category: 'restaurant',
      location: location,
      sort_by: 'distance',
      limit: 6,
    };

    let queryGroomers = {
      term: 'groomers',
      category: 'petservices,All',
      location: location,
      sort_by: 'distance',
      limit: 6,
    };

    let queryVets = {
      term: 'veterinarians',
      category: 'vet,All',
      location: location,
      sort_by: 'distance',
      limit: 6,
    };

    let queryDogDayCare = {
      term: 'dog daycare',
      category: 'petservices,All',
      location: location,
      sort_by: 'distance',
      limit: 6,
    };

    let promises = [];
    promises.push(
      superagent
        .get(API1)
        .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
        .query(queryFoodTruck)
    );
    promises.push(
      superagent
        .get(API1)
        .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
        .query(queryGroomers)
    );
    promises.push(
      superagent
        .get(API1)
        .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
        .query(queryVets)
    );
    promises.push(
      superagent
        .get(API1)
        .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
        .query(queryDogDayCare)
    );
    let [foodtruck, groomers, vets, dogDayCare] = await Promise.all(promises);

    let foodTruckArr = foodtruck.body.businesses.map(
      (truck) => new FoodTrucks(truck)
    );
    let groomersArr = groomers.body.businesses.map(
      (groomer) => new Groomers(groomer)
    );
    let vetsArr = vets.body.businesses.map((vet) => new Vets(vet));
    let dogDayCareArr = dogDayCare.body.businesses.map(
      (dayCare) => new DogDayCare(dayCare)
    );
    return {
      foodtruck1: foodTruckArr,
      groomer1: groomersArr,
      vets1: vetsArr,
      dogDayCare1: dogDayCareArr,
    };
  } catch (error) {
    next(error);
  }
}

function FoodTrucks(obj) {
  this.food_truck_name = obj.name || 'NAME NOT AVAILABLE';
  this.food_truck_image_url =
    obj.image_url ||
    'https://thumbs.dreamstime.com/b/no-image-available-icon-photo-camera-flat-vector-illustration-132483296.jpg';
  this.food_truck_url = obj.url || 'URL NOT AVAIALABLE';
  this.food_truck_address =
    obj.location.display_address[0] +
    ' ' +
    (obj.location.display_address[1] || '');
  this.food_truck_phone = obj.display_phone || 'PHONE NUMBER NOT AVAILABLE';
}

function Groomers(obj) {
  this.groomers_name = obj.name || 'NAME NOT AVAILABLE';
  this.groomers_image_url =
    obj.image_url ||
    'https://thumbs.dreamstime.com/b/no-image-available-icon-photo-camera-flat-vector-illustration-132483296.jpg';
  this.groomers_url = obj.url || 'URL NOT AVAIALABLE';
  this.groomers_address =
    obj.location.display_address[0] +
    ' ' +
    (obj.location.display_address[1] || '');
  this.groomers_phone = obj.display_phone || 'PHONE NUMBER NOT AVAILABLE';
}

function Vets(obj) {
  this.vets_name = obj.name || 'NAME NOT AVAILABLE';
  this.vets_image_url =
    obj.image_url ||
    'https://thumbs.dreamstime.com/b/no-image-available-icon-photo-camera-flat-vector-illustration-132483296.jpg';
  this.vets_url = obj.url || 'URL NOT AVAIALABLE';
  this.vets_address =
    obj.location.display_address[0] +
    ' ' +
    (obj.location.display_address[1] || '');
  this.vets_phone = obj.display_phone || 'PHONE NUMBER NOT AVAILABLE';
}

function DogDayCare(obj) {
  this.dog_dayCare_name = obj.name || 'NAME NOT AVAILABLE';
  this.dog_dayCare_image_url =
    obj.image_url ||
    'https://thumbs.dreamstime.com/b/no-image-available-icon-photo-camera-flat-vector-illustration-132483296.jpg';
  this.dog_dayCare_url = obj.url || 'URL NOT AVAIALABLE';
  this.dog_dayCare_address =
    obj.location.display_address[0] +
    ' ' +
    (obj.location.display_address[1] || '');
  this.dog_dayCare_phone = obj.display_phone || 'PHONE NUMBER NOT AVAILABLE';
}

// ----------------------------------------------
// CONSTRUCTORS
// ----------------------------------------------

function Park(obj) {
  //api data
  this.yelp_id = obj.id;
  this.name = obj.name || 'NAME NOT AVAILABLE';
  this.image_url =
    obj.image_url ||
    'https://thumbs.dreamstime.com/b/no-image-available-icon-photo-camera-flat-vector-illustration-132483296.jpg';
  this.address =
    obj.location.display_address[0] +
    ' ' +
    (obj.location.display_address[1] || '');
  this.lat = obj.coordinates.latitude;
  this.long = obj.coordinates.longitude;
}

// ----------------------------------------------
// Error Handlers
// ----------------------------------------------

function handleNotFound(req, res) {
  res.status(404).send('Could Not Find What You Asked For');
}

function handleError(error, res) {
  console.error(error);
  res.status(500).render('error', { error_data: error });
}

// ----------------------------------------------
// CONNECT
// ----------------------------------------------

client.connect().then(() => {
  app.listen(PORT, () => console.log('Server running on port', PORT));
});
