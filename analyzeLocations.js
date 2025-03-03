const fs = require('fs');
const path = require('path');

// Read the file content
const filePath = path.join(__dirname, 'locations2.txt');
const fileContent = fs.readFileSync(filePath, 'utf-8');

// Parse the file content
const lines = fileContent.split('\n').slice(1); // Skip the header line
const locations = lines.map(line => {
    const [type, time, latitude, longitude, name, id] = line.split('\t');
    return { type, time, latitude: parseFloat(latitude), longitude: parseFloat(longitude), name, id: parseInt(id) };
});

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

// Find potential noise locations
const noiseLocations = [];
for (let i = 1; i < locations.length; i++) {
    const prevLocation = locations[i - 1];
    const currLocation = locations[i];
    const distance = haversineDistance(prevLocation.latitude, prevLocation.longitude, currLocation.latitude, currLocation.longitude);
    if (distance > 1) { // Threshold distance in kilometers
        noiseLocations.push(currLocation);
    }
}

// Output the noise locations
console.log('Potential noise locations:', noiseLocations);
