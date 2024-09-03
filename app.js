// Replace `<YOUR_NOMINATIM_ENDPOINT>` with the Nominatim API endpoint
const nominatimEndpoint = 'https://nominatim.openstreetmap.org/search';
// Replace `<YOUR_SMASHGG_API_ENDPOINT>` with the Smash.gg API endpoint
const smashGGEndpoint = 'cache.json';

// Initialize the map
const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Request location and zoom if allowed
async function requestLocationAndZoom() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude } = position.coords;
            map.setView([latitude, longitude], 3);

            const currentZoom = map.getZoom();
            const targetZoom = 10;
            const duration = 3000;
            const interval = 20;
            const steps = duration / interval;
            const zoomIncrement = (targetZoom - currentZoom) / steps;

            let stepCount = 0;
            const zoomInterval = setInterval(() => {
                stepCount++;
                const newZoom = currentZoom + zoomIncrement * stepCount;
                map.setZoom(newZoom);
                if (stepCount >= steps) {
                    clearInterval(zoomInterval);
                }
            }, interval);
        }, error => {
            console.error('Error getting user location:', error);
        });
    } else {
        console.error('Geolocation is not supported by this browser.');
    }
}

// Fetch video games data for search bar autocomplete
async function fetchVideoGames() {
    try {
        const response = await fetch(smashGGEndpoint);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        return data.entities.videogame.map(game => ({
            id: game.id,
            name: game.name
        }));
    } catch (error) {
        console.error(`Error fetching video games data: ${error.message}`);
        throw error;
    }
}

// Fetch tournament data
async function fetchData(videogameId) {
    try {
        let allTournaments = [];
        const headers = { "Authorization": "Bearer c2a8a8f10786247a50b5be6cb87bc012" };

        for (let page = 1; page <= 5; page++) {
            const response = await fetch('https://api.start.gg/gql/alpha', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    query: `
                      query TournamentsByVideogame($perPage: Int!, $page: Int!, $videogameId: ID!) {
                        tournaments(query: {
                          perPage: $perPage
                          page: $page
                          sortBy: "startAt asc"
                          filter: {
                            upcoming: true
                            videogameIds: [$videogameId]
                          }
                        }) {
                          nodes {
                            name
                            url
                            lat
                            lng
                            isRegistrationOpen
                            numAttendees
                            startAt
                          }
                        }
                      }
                    `,
                    variables: {
                        "perPage": 300,
                        "page": page,
                        "videogameId": videogameId
                    }
                }),
            });

            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const jsonData = await response.json();
            const tournaments = jsonData.data.tournaments.nodes;
            allTournaments = allTournaments.concat(tournaments.filter(tournament => tournament.isRegistrationOpen !== false));
        }

        return allTournaments;
    } catch (error) {
        console.error(`Error fetching data: ${error.message}`);
        throw error;
    }
}

const allMarkers = [];

// Display data on the map
async function displayData(gameId) {
    try {
        const data = await fetchData(gameId);
        const groupedTournaments = {};
        const videoGames = await fetchVideoGames();
        const selectedGame = videoGames.find(game => game.id === gameId);
        const gameName = selectedGame ? selectedGame.name : 'Unknown Game';
        const currentTime = new Date().getTime();

        data.forEach(tournament => {
            const { name, lat, lng, startAt, url, numAttendees } = tournament;
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);

            if (!isNaN(latNum) && !isNaN(lngNum)) {
                const timeDifference = startAt * 1000 - currentTime;
                const withinNext14Days = timeDifference <= 14 * 24 * 60 * 60 * 1000;
                const key = `${latNum},${lngNum}`;

                if (!groupedTournaments[key]) {
                    groupedTournaments[key] = { tournaments: [], withinNext14Days };
                }

                groupedTournaments[key].tournaments.push({ name, lat: latNum, lng: lngNum, startAt, url, numAttendees });
            } else {
                console.error(`Invalid lat/lng values for tournament: ${name}`);
            }
        });

        if (Object.keys(groupedTournaments).length === 0) {
            const popup = L.popup()
                .setLatLng(map.getCenter())
                .setContent("No Tournaments Found")
                .openOn(map);
            setTimeout(() => map.closePopup(popup), 10000);
        }

        Object.values(groupedTournaments).forEach(group => {
            const { tournaments, withinNext14Days } = group;
            const avgLat = tournaments.reduce((sum, t) => sum + t.lat, 0) / tournaments.length;
            const avgLng = tournaments.reduce((sum, t) => sum + t.lng, 0) / tournaments.length;
            const numAttendeesGroup = tournaments.reduce((acc, t) => acc + t.numAttendees, 0);
            let iconColor = determineIconColor(tournaments, numAttendeesGroup, withinNext14Days);

            const marker = L.marker([avgLat, avgLng]).addTo(map);
            allMarkers.push(marker);
            bindPopupToMarker(marker, tournaments);

            marker.setIcon(L.icon({
                iconUrl: `custom pin/marker-icon-${iconColor}.png`,
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            }));
        });

        createLegendControl();
    } catch (error) {
        console.error(`Error displaying data: ${error.message}`);
    }
}

// Determine the icon color based on tournaments
function determineIconColor(tournaments, numAttendeesGroup, withinNext14Days) {
    const keywordsMasterPlus = ["evo japan 2024", "evo 2024"];
    const keywordsMaster = ["paradise game battle 2024", "combo breaker 2024", "battle arena melbourne 2024", "tgu 2024", "punishment 2", "the mixup 2024", "ceo 2024", "atl super tournament 2024", "vsfighting xii", "emirates showdown 2024"];
    const keywordsChallenger = ["electric clash 2024", "only the best 2024", "ufa 2024", "3f - fight for the future", "second wind 2024", "thunderstruck 2024", "brussels challenge 2024", "fv major 2024", "clash of the olympians 2024", "dreamhack dallas 2024", "crossover 2024", "cape town showdown 2024", "hado fight festival", "moor1ng"];

    if (tournaments.some(tournament => keywordsMasterPlus.some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
        return 'gold';
    } else if (tournaments.some(tournament => keywordsMaster.some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
        return 'gold';
    } else if (tournaments.some(tournament => keywordsChallenger.some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
        return 'grey';
    } else if (withinNext14Days) {
        if (numAttendeesGroup >= 96) return 'black';
        if (numAttendeesGroup >= 64) return 'violet';
        if (numAttendeesGroup >= 48) return 'red';
        if (numAttendeesGroup >= 32) return 'orange';
        if (numAttendeesGroup >= 24) return 'yellow';
        if (numAttendeesGroup >= 16) return 'green';
        return 'white';
    }
    return 'blue';
}

// Bind popup to marker
function bindPopupToMarker(marker, tournaments) {
    const content = tournaments.length > 1
        ? `<ul>${tournaments.map(tournament => `<li><b>${tournament.name}</b><br>Starts at: ${new Date(tournament.startAt * 1000).toLocaleString()}<br><a href="https://start.gg${tournament.url}" target="_blank">Sign Up Link</a><br>Attendees: ${tournament.numAttendees}</li>`).join('')}</ul>`
        : `<b>${tournaments[0].name}</b><br>Starts at: ${new Date(tournaments[0].startAt * 1000).toLocaleString()}<br><a href="https://start.gg${tournaments[0].url}" target="_blank">Sign Up Link</a><br>Attendees: ${tournaments[0].numAttendees}`;

    marker.bindPopup(content);
}

// Create legend control on the map
function createLegendControl() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function() {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = `
            <h4>Legend</h4>
            <i style="background: gold"></i><span>Master Plus</span><br>
            <i style="background: gold"></i><span>Master</span><br>
            <i style="background: grey"></i><span>Challenger</span><br>
            <i style="background: black"></i><span>96+ Attendees</span><br>
            <i style="background: violet"></i><span>64+ Attendees</span><br>
            <i style="background: red"></i><span>48+ Attendees</span><br>
            <i style="background: orange"></i><span>32+ Attendees</span><br>
            <i style="background: yellow"></i><span>24+ Attendees</span><br>
            <i style="background: green"></i><span>16+ Attendees</span><br>
            <i style="background: white"></i><span>Less than 16 Attendees</span>
        `;
        return div;
    };
    legend.addTo(map);
}

// Initialize the app
function init() {
    requestLocationAndZoom();
    fetchVideoGames().then(videogames => {
        const selectElement = document.getElementById('videogameSelect');
        videogames.forEach(game => {
            const option = document.createElement('option');
            option.value = game.id;
            option.textContent = game.name;
            selectElement.appendChild(option);
        });

        selectElement.addEventListener('change', (event) => {
            const gameId = event.target.value;
            allMarkers.forEach(marker => map.removeLayer(marker));
            allMarkers.length = 0;
            displayData(gameId);
        });
    }).catch(error => {
        console.error(`Error initializing app: ${error.message}`);
    });
}

init();
