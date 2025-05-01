const map = L.map('map').setView([41.9965, 21.4314], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Skopje bounding box
const skopjeBounds = {
    south: 41.95,
    west: 21.35,
    north: 42.05,
    east: 21.55
};

// Marker icons
const sunIcon = L.divIcon({ className: 'sun-marker', html: '☀️', iconSize: [30, 30] });
const cafeIcon = L.divIcon({ className: 'cafe-marker', html: '☕', iconSize: [25, 25] });

let cafeMarkers = [];
let sunnyCafes = 0;

async function fetchCafes() {
    const overpassUrl = "https://overpass-api.de/api/interpreter";
    const query = `
                [out:json][timeout:25];
                (
                    node["amenity"="cafe"](${skopjeBounds.south},${skopjeBounds.west},${skopjeBounds.north},${skopjeBounds.east});
                    way["amenity"="cafe"](${skopjeBounds.south},${skopjeBounds.west},${skopjeBounds.north},${skopjeBounds.east});
                    relation["amenity"="cafe"](${skopjeBounds.south},${skopjeBounds.west},${skopjeBounds.north},${skopjeBounds.east});
                );
                out center geom;
            `;

    try {
        document.querySelector('.status').textContent = "Loading café data...";
        const response = await fetch(overpassUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
            },
            body: `data=${encodeURIComponent(query)}`
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        return data.elements || [];
    } catch (error) {
        console.error("Error fetching café data:", error);
        document.querySelector('.status').textContent = "Error loading café data. Trying again...";
        setTimeout(fetchCafes, 5000);
        return [];
    }
}

function degreesDiff(a, b) {
    let d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

function isFacingSun(cafe, sunAzimuth) {
    if (!cafe.center || !cafe.nodes || cafe.nodes.length < 2) return true;

    // Use first and last node to guess facing direction
    const first = cafe.geometry?.[0];
    const last = cafe.geometry?.[cafe.geometry.length - 1];
    if (!first || !last) return true;

    const latDiff = last.lat - first.lat;
    const lngDiff = last.lon - first.lon;
    const angle = Math.atan2(latDiff, lngDiff) * 180 / Math.PI;
    const orientation = (angle + 360) % 360;

    return degreesDiff(orientation, sunAzimuth) < 90;
}

function isInSunlight(lat, lng, cafe) {
    const now = new Date();
    const sunPos = SunCalc.getPosition(now, lat, lng);
    const sunAzimuthDeg = (sunPos.azimuth * 180 / Math.PI + 180) % 360;
    if (sunPos.altitude <= 0) return false;
    return isFacingSun(cafe, sunAzimuthDeg);
}

function updateCafeMarkers(cafes) {
    cafeMarkers.forEach(marker => map.removeLayer(marker));
    cafeMarkers = [];
    sunnyCafes = 0;
    const now = new Date();

    cafes.forEach(cafe => {
        let lat, lng;
        if (cafe.type === "node") {
            lat = cafe.lat;
            lng = cafe.lon;
        } else if (cafe.center) {
            lat = cafe.center.lat;
            lng = cafe.center.lon;
        } else {
            return;
        }

        const sunny = isInSunlight(lat, lng, cafe);
        if (sunny) sunnyCafes++;

        const marker = L.marker([lat, lng], {
            icon: sunny ? sunIcon : cafeIcon,
            zIndexOffset: sunny ? 1000 : 0
        }).addTo(map);

        const name = cafe.tags?.name || "Unnamed Café";
        marker.bindTooltip(`${name} (${sunny ? "Sunny!" : "In shade"})`);

        cafeMarkers.push(marker);
    });

    document.querySelector('.status').textContent =
        `Found ${cafes.length} cafés. ${sunnyCafes} currently sunny.`;
    document.getElementById('update-time').textContent =
        now.toLocaleTimeString();
}

async function loadData() {
    const cafes = await fetchCafes();
    if (cafes.length > 0) {
        updateCafeMarkers(cafes);
        setInterval(() => updateCafeMarkers(cafes), 5 * 60 * 1000);
    } else {
        setTimeout(loadData, 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadData();
});
   