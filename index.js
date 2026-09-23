require('dotenv').config()

const express = require('express')
const { getAuth } = require('firebase-admin/auth')
const { cert, getApps, initializeApp } = require('firebase-admin/app')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')

const app = express()
const locationsCollectionName = 'bg-location-records'

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

// Initialize Firebase Admin client
function createFirebaseApp() {
    const encodedServiceAccount = process.env.FIREBASE_SA_BASE64

    if (!encodedServiceAccount) {
        throw new Error('FIREBASE_SA_BASE64 is not configured')
    }

    let serviceAccount
    try {
        serviceAccount = JSON.parse(Buffer.from(encodedServiceAccount, 'base64').toString('utf8'))
    } catch (error) {
        throw new Error('FIREBASE_SA_BASE64 is not valid base64-encoded JSON')
    }

    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error('FIREBASE_SA_BASE64 does not contain a complete Firebase service account')
    }

    return getApps().length > 0
        ? getApps()[0]
        : initializeApp({ credential: cert(serviceAccount) })
}

const firebaseApp = createFirebaseApp()
const auth = getAuth(firebaseApp)
const db = getFirestore(firebaseApp)
const locationsRootCollection = db.collection(locationsCollectionName)

function getUserLocationsCollection(uid) {
    return locationsRootCollection.doc(uid).collection('locations')
}

function getBearerToken(req) {
    const authorization = req.get('authorization') || ''
    const match = authorization.match(/^Bearer\s+(.+)$/i)
    return match ? match[1] : null
}

async function requireAuth(req, res, next) {
    const token = getBearerToken(req)

    if (!token) {
        return res.status(401).json({ error: 'Authorization Bearer token is required' })
    }

    try {
        req.user = await auth.verifyIdToken(token)
        next()
    } catch (error) {
        console.error('Error verifying Firebase ID token:', error.code || error.message)
        res.status(401).json({ error: 'Invalid or expired Firebase token' })
    }
}

function formatBangkokDateTime(date = new Date()) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).format(date).replace(',', '')
}

function parseBangkokDateTime(value) {
    if (typeof value !== 'string') {
        return null
    }

    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/)
    if (!match) {
        return null
    }

    const [, day, month, year, hour, minute, second] = match
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 7, Number(minute), Number(second)))
}

function getRecordTime(record) {
    if (record.recorded_at && typeof record.recorded_at.toDate === 'function') {
        return record.recorded_at.toDate()
    }

    return parseBangkokDateTime(record.date_time)
}

function getRecordTimeInUtc(record) {
    const date = getRecordTime(record)
    return date ? date.toISOString() : record.date_time || ''
}

app.get('/hello', (req, res) => {
    res.status(200).json({ message: 'Hello, user!' })
})

app.post('/location', requireAuth, async (req, res) => {
    const { location } = req.body || {}
    const device = location?.extras?.device ?? req.body?.device ?? null
    const coords = location && location.coords
    const latitude = Number(coords && coords.latitude)
    const longitude = Number(coords && coords.longitude)

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'Valid latitude and longitude are required' })
    }

    const activity = location.activity || {}
    const date_time = formatBangkokDateTime()
    const record = {
        user_id: req.user.uid,
        lat: latitude,
        lng: longitude,
        date_time,
        remark: 'from nodejs',
        event: location.event ?? null,
        type: activity.type ?? null,
        confidence: activity.confidence ?? null,
        device: device ?? null,
        recorded_at: FieldValue.serverTimestamp(),
    }

    try {
        const document = await getUserLocationsCollection(req.user.uid).add(record)
        res.status(200).json({
            message: 'Location received and inserted.',
            id: document.id,
        })
    } catch (error) {
        console.error('Error inserting location into Firestore:', error)
        res.status(500).json({ error: 'Failed to insert location' })
    }
})

// Function to calculate the distance between two coordinates using Haversine formula
function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = angle => (angle * Math.PI) / 180
    const radius = 6371
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(1 - Math.min(1, a)))
    return radius * c
}

function buildKmlContent(locations) {
    const coordinates = locations
        .map(location => `${location.lng},${location.lat},0`)
        .join('\n')

    const geometry = locations.length > 1
        ? `<LineString>
            <tessellate>1</tessellate>
            <coordinates>${coordinates}</coordinates>
        </LineString>`
        : locations.length === 1
            ? `<Point><coordinates>${coordinates}</coordinates></Point>`
            : ''

    const pathPlacemark = geometry
        ? `<Placemark>
            <name>Background location path</name>
            <styleUrl>#locationPathStyle</styleUrl>
            ${geometry}
        </Placemark>`
        : ''

    const pointPlacemarks = locations
        .map((location, index) => `<Placemark>
            <name>${index}</name>
            <styleUrl>#locationPointStyle</styleUrl>
            <Point><coordinates>${location.lng},${location.lat},0</coordinates></Point>
        </Placemark>`)
        .join('\n')

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
        <name>Background location path</name>
        <Style id="locationPathStyle">
            <LineStyle>
                <color>ff0000ff</color>
                <width>4</width>
            </LineStyle>
        </Style>
        <Style id="locationPointStyle">
            <IconStyle>
                <scale>0.8</scale>
            </IconStyle>
            <LabelStyle>
                <color>ff000000</color>
                <scale>1.0</scale>
            </LabelStyle>
        </Style>
        ${pathPlacemark}
        ${pointPlacemarks}
    </Document>
</kml>`
}

async function getFilteredLocations(uid) {
    const snapshot = await getUserLocationsCollection(uid).get()
    const records = snapshot.docs
        .map(document => ({ id: document.id, ...document.data() }))
        .sort((first, second) => {
            const firstTime = getRecordTime(first)?.getTime() ?? 0
            const secondTime = getRecordTime(second)?.getTime() ?? 0
            return firstTime - secondTime
        })

    console.log(`Fetched ${records.length} locations`)

    const mappedData = records.map(record => ({
        ...record,
        date_time: getRecordTimeInUtc(record),
    }))

    // Find potential noise locations
    const noiseIds = new Set()
    for (let i = 1; i < mappedData.length; i += 1) {
        const previous = mappedData[i - 1]
        const current = mappedData[i]
        const distance = haversineDistance(previous.lat, previous.lng, current.lat, current.lng)
        if (distance > 1) {
            noiseIds.add(current.id)
            console.log('Noise location:', current)
        }
    }

    // Filter out noise locations
    const filteredData = mappedData.filter(location => !noiseIds.has(location.id))
    console.log(`FilteredData ${filteredData.length} locations`)
    return filteredData
}

async function locationsHandler(req, res) {
    try {
        const filteredData = await getFilteredLocations(req.user.uid)
        const textContent = filteredData
            .map(location => `${location.lat}, ${location.lng}, ${location.date_time}`)
            .join('\n')
        const kmlContent = buildKmlContent(filteredData)

        if (req.path === '/locations.kml' || req.query.format === 'kml') {
            return res
                .status(200)
                .type('application/vnd.google-earth.kml+xml')
                .set('Content-Disposition', 'attachment; filename="locations.kml"')
                .send(kmlContent)
        }

        res.status(200).json({
            textContent,
            kmlContent,
            count: filteredData.length,
        })
    } catch (error) {
        console.error('Error fetching locations from Firestore:', error)
        res.status(500).json({ error: 'Failed to fetch locations' })
    }
}

app.get(['/locations', '/locations.kml'], requireAuth, locationsHandler)

const port = Number(process.env.PORT) || 3000
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`)
    })
}

module.exports = app
