const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const moment = require('moment')
require('moment-timezone');

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Initialize Supabase client
const supabaseUrl = 'https://qcbboryvctqlbjavxucq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjYmJvcnl2Y3RxbGJqYXZ4dWNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk3ODc4ODcsImV4cCI6MjA1NTM2Mzg4N30.fsTqL2eHBD90CYV8RTvyihnpZaM_NIKiZq3XUeTqRhA'
const supabase = createClient(supabaseUrl, supabaseKey)

app.get('/hello', (req, res) => {
    res.status(200).json({ message: 'Hello, user!' });
})

app.post('/location', async (req, res) => {
    const { latitude, longitude } = req.body;
    console.log('request body:', req.body);

    if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    // Get current date and time in Thailand time zone
    const date_time = moment().tz('Asia/Bangkok').format('DD/MM/YYYY HH:mm:ss');

    // Insert location into Supabase database
    const { data, error } = await supabase
        .from('location')
        .insert([{ lat: latitude, lng: longitude, date_time, remark: 'from nodejs' }])

    if (error) {
        console.error('Error inserting location:', error);
        return res.status(500).json({ error: 'Failed to insert location' });
    }

    res.status(200).json({ message: 'Location received and inserted' });
})

const port = 3000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

module.exports = app;