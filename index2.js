const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const moment = require('moment')
const fs = require('fs')
require('moment-timezone');

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Initialize Supabase client
const supabaseUrl = 'https://qcbboryvctqlbjavxucq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjYmJvcnl2Y3RxbGJqYXZ4dWNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk3ODc4ODcsImV4cCI6MjA1NTM2Mzg4N30.fsTqL2eHBD90CYV8RTvyihnpZaM_NIKiZq3XUeTqRhA'
const supabase = createClient(supabaseUrl, supabaseKey)

app.get('/hello', (req, res) => {
    res.status(200).json({ message: 'Hello new world!!' });
})

app.post('/location', async (req, res) => {
    const { location, device } = req.body;
    console.log('request body:', req.body);

    if (!location || !location.coords || location.coords.latitude === undefined || location.coords.longitude === undefined) {
        return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const { latitude, longitude } = location.coords;
    const event = location.event || null;
    const { type, confidence } = location.activity || {};

    // Get current date and time in Thailand time zone
    const date_time = moment().tz('Asia/Bangkok').format('DD/MM/YYYY HH:mm:ss');

    // Insert location into Supabase database
    const { data, error } = await supabase
        .from('location')
        .insert([{
            lat: latitude,
            lng: longitude,
            date_time,
            remark: 'from nodejs',
            event,
            type,
            device,
        }])

    if (error) {
        console.error('Error inserting location:', error);
        return res.status(500).json({ error: 'Failed to insert location' });
    }

    res.status(200).json({ message: 'Location received and inserted.' });
})

// Function to calculate the distance between two coordinates using Haversine formula
function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = angle => (angle * Math.PI) / 180;
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

app.get('/locations', async (req, res) => {
    let query = supabase
        .from('location')
        .select('id, date_time, lat, lng')
        .gte('id', 1376)


    const { data, error } = await query;

    if (error) {
        console.error('Error fetching locations:', error);
        return res.status(500).json({ error: 'Failed to fetch locations' });
    }

    console.log(`Fetched ${data.length} locations`);

    // Map date_time to UTC format
    const mappedData = data.map(location => ({
        ...location,
        date_time: moment.tz(location.date_time, 'DD/MM/YYYY HH:mm:ss', 'Asia/Bangkok').utc().format()
    }));

    // Find potential noise locations
    const noiseLocations = [];
    for (let i = 1; i < mappedData.length; i++) {
        const prevLocation = mappedData[i - 1];
        const currLocation = mappedData[i];
        const distance = haversineDistance(prevLocation.lat, prevLocation.lng, currLocation.lat, currLocation.lng);
        if (distance > 1) { // Threshold distance in kilometers
            noiseLocations.push(currLocation);
            console.log('Noise location:', currLocation); // Print noise location
        }
    }

    // Filter out noise locations
    const filteredData = mappedData.filter(location => !noiseLocations.includes(location));

    console.log(`FilteredData ${filteredData.length} locations`);

    const fileContent = filteredData.map(location => `${location.lat}, ${location.lng}, ${location.date_time}`).join('\n');
    fs.writeFileSync('locations.txt', fileContent);

    res.status(200).json({ message: 'Locations fetched and written to locations.txt' });
})

const port = 3000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

module.exports = app;