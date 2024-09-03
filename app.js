// Replace `<YOUR_NOMINATIM_ENDPOINT>` with the Nominatim API endpoint
var nominatimEndpoint = 'https://nominatim.openstreetmap.org/search';
// Replace `<YOUR_SMASHGG_API_ENDPOINT>` with the Smash.gg API endpoint
var smashGGEndpoint = 'cache.json';

var map = L.map('map').setView([0, 0], 2);

// Initialize the map
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

var allMarkers = [];
var selectedGames = new Set(); // Use a Set to store selected game IDs
var token = "c2a8a8f10786247a50b5be6cb87bc012";
var headers = { "Authorization": "Bearer " + token };

// Request location permission and zoom if allowed
function requestLocationAndZoom() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            var latitude = position.coords.latitude;
            var longitude = position.coords.longitude;

            map.setView([latitude, longitude], 3);
            var currentZoom = map.getZoom();
            var targetZoom = 10;
            var duration = 3000;
            var interval = 20;
            var steps = duration / interval;
            var zoomDiff = targetZoom - currentZoom;
            var zoomIncrement = zoomDiff / steps;
            var stepCount = 0;

            function gradualZoom() {
                stepCount++;
                var newZoom = currentZoom + zoomIncrement * stepCount;
                map.setZoom(newZoom);

                if (stepCount >= steps) {
                    clearInterval(zoomInterval);
                }
            }

            var zoomInterval = setInterval(gradualZoom, interval);
        }, function (error) {
            console.error('Error getting user location:', error);
        });
    } else {
        console.error('Geolocation is not supported by this browser.');
    }
}

document.addEventListener("DOMContentLoaded", function () {
    requestLocationAndZoom();
});

// Fetch data from Smash.gg API
async function fetchData(videogameId) {
    try {
        let allTournaments = [];

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
                            videogameIds: [
                              $videogameId
                            ]
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

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const json_data = await response.json();
            const tournaments = json_data.data.tournaments.nodes;
            const filteredTournaments = tournaments.filter(tournament => tournament.isRegistrationOpen !== false);
            allTournaments = allTournaments.concat(filteredTournaments);
        }

        return allTournaments;
    } catch (error) {
        console.error(`Error fetching data: ${error.message}`);
        throw error;
    }
}

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

            if (!isNaN(latNum) && !isNaN(lngNum) && lat !== null && lng !== null) {
                const timeDifference = startAt * 1000 - currentTime;
                const withinNext14Days = timeDifference <= 14 * 24 * 60 * 60 * 1000;
                const key = `${latNum},${lngNum}`;

                if (!groupedTournaments[key]) {
                    groupedTournaments[key] = {
                        tournaments: [],
                        withinNext14Days
                    };
                }

                groupedTournaments[key].tournaments.push({
                    name,
                    lat: latNum,
                    lng: lngNum,
                    startAt,
                    url,
                    numAttendees
                });
            } else {
                console.error(`Invalid lat/lng values or null for tournament: ${name}`);
            }
        });

        if (Object.keys(groupedTournaments).length === 0) {
            const popup = L.popup()
                .setLatLng(map.getCenter())
                .setContent("No Tournaments Found")
                .openOn(map);

            setTimeout(function () {
                map.closePopup(popup);
            }, 10000);
        }

        Object.values(groupedTournaments).forEach(group => {
            const { tournaments, withinNext14Days } = group;
            let totalLat = 0;
            let totalLng = 0;
            tournaments.forEach(tournament => {
                totalLat += tournament.lat;
                totalLng += tournament.lng;
            });
            const avgLat = totalLat / tournaments.length;
            const avgLng = totalLng / tournaments.length;
            let iconColor;
            const numAttendeesGroup = tournaments.reduce((acc, curr) => acc + curr.numAttendees, 0);

            if (tournaments.some(tournament => ["evo japan 2024", "evo 2024"].some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
                iconColor = 'gold';
            } else if (tournaments.some(tournament => ["paradise game battle 2024", "combo breaker 2024", "battle arena melbourne 2024", "tgu 2024", "punishment 2", "the mixup 2024", "ceo 2024", "atl super tournament 2024", "vsfighting xii", "emirates showdown 2024"].some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
                iconColor = 'gold';
            } else if (tournaments.some(tournament => ["electric clash 2024", "only the best 2024", "ufa 2024", "3f - fight for the future", "second wind 2024", "thunderstruck 2024", "brussels challenge 2024", "fv major 2024", "clash of the olympians 2024", "dreamhack dallas 2024", "crossover 2024", "cape town showdown 2024", "hado fight festival", "moor1ng"].some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
                iconColor = 'grey';
            } else if (withinNext14Days) {
                if (numAttendeesGroup >= 96) {
                    iconColor = 'black';
                } else if (numAttendeesGroup >= 64) {
                    iconColor = 'violet';
                } else if (numAttendeesGroup >= 48) {
                    iconColor = 'red';
                } else if (numAttendeesGroup >= 32) {
                    iconColor = 'orange';
                } else if (numAttendeesGroup >= 24) {
                    iconColor = 'yellow';
                } else if (numAttendeesGroup >= 16) {
                    iconColor = 'green';
                } else {
                    iconColor = 'white';
                }
            } else {
                iconColor = 'blue';
            }

            const marker = L.marker([avgLat, avgLng]).addTo(map);
            allMarkers.push(marker);

            if (tournaments.length > 1) {
                let popupContent = '<ul>';
                tournaments.forEach(tournament => {
                    const gameName = tournament.gameName || 'Unknown Game';
                    popupContent += `<li><b>${tournament.name}</b><br>Starts at: ${new Date(tournament.startAt * 1000).toLocaleString()}<br><a href="https://start.gg${tournament.url}" target="_blank">Sign Up Link</a><br>Attendees: ${tournament.numAttendees}</li>`;
                });
                popupContent += '</ul>';
                marker.bindPopup(popupContent);
            } else {
                const { name, startAt, url, numAttendees, gameName } = tournaments[0];
                marker.bindPopup(`<b>${name}</b><br>Starts at: ${new Date(startAt * 1000).toLocaleString()}UTC<br><a href="https://start.gg${url}" target="_blank">Sign Up Link</a><br>Attendees: ${numAttendees}`);
            }

            marker.setIcon(L.divIcon({
                className: 'custom-icon',
                html: `<div style="background-color: ${iconColor}; width: 20px; height: 20px; border-radius: 50%;"></div>`
            }));
        });
    } catch (error) {
        console.error(`Error displaying data: ${error.message}`);
    }
}

// Load and cache video game data
var videoGamesCache = [];

async function fetchVideoGames() {
    if (videoGamesCache.length > 0) {
        return videoGamesCache;
    }

    try {
        const response = await fetch('https://api.start.gg/gql/alpha', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                query: `
                  query {
                    videogames {
                      nodes {
                        id
                        name
                      }
                    }
                  }
                `
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const json_data = await response.json();
        videoGamesCache = json_data.data.videogames.nodes;
        return videoGamesCache;
    } catch (error) {
        console.error(`Error fetching video games: ${error.message}`);
        throw error;
    }
}

// Handle autocomplete for game search
var autoCompleteGameInput = document.getElementById('autoCompleteGameInput');

autoCompleteGameInput.addEventListener('input', async function () {
    const query = this.value.toLowerCase();
    if (query.length > 2) {
        const videoGames = await fetchVideoGames();
        const filteredGames = videoGames.filter(game => game.name.toLowerCase().includes(query));

        const suggestions = document.getElementById('suggestions');
        suggestions.innerHTML = '';

        filteredGames.forEach(game => {
            const suggestionItem = document.createElement('div');
            suggestionItem.textContent = game.name;
            suggestionItem.addEventListener('click', function () {
                autoCompleteGameInput.value = game.name;
                suggestions.innerHTML = '';
                updateMapWithGame(game.id);
            });
            suggestions.appendChild(suggestionItem);
        });
    }
});

// Update map with selected game
async function updateMapWithGame(gameId) {
    selectedGames.add(gameId);
    await displayData(gameId);
}

// Handle auto-fill for the form
document.querySelector('form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const gameName = document.getElementById('autoCompleteGameInput').value;
    const videoGames = await fetchVideoGames();
    const selectedGame = videoGames.find(game => game.name.toLowerCase() === gameName.toLowerCase());

    if (selectedGame) {
        updateMapWithGame(selectedGame.id);
    } else {
        console.error('Game not found');
    }
});
