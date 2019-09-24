$(document).ready(function () {

    // map element
    var map;

    // points for path
    var points = new Array(2);
    var markers = new Array(2);

    // current shown path
    var currentPath;

    class Point {
        constructor(lat, lng) {
            this.lat = lat;
            this.lng = lng;
        }
    }

    // controller to cancel fetch requests
    var abortController = new AbortController();

    var Leaflet = {

        baseCenter: [51, 10],
        baseZoom: 5,

        defaultPathStyle: {
            weight: 8,
            opacity: .75
        },

        initMap() {
            map = L.map('map').setView(this.baseCenter, this.baseZoom);
            L.tileLayer.provider(Thunderforest.mapStyle, {
                apikey: Thunderforest.apiKey
            }).addTo(map);
            L.control.scale().addTo(map);
        },

        addMarker(coordinates) {
            return L.marker(coordinates).addTo(map);
        },

        removeLayer(layer) {
            if (layer != undefined) {
                map.removeLayer(layer);
            }
        },

        flyToMarker(marker) {
            map.flyTo(marker.getLatLng())
        },

        addPath(geoJsonFeature, style = this.defaultPathStyle) {
            return L.geoJson(geoJsonFeature, {
                style: style
            }).addTo(map);
        }
    }

    var Thunderforest = {
        apiKey: '06ca471c8d2d4e1cac753d9556cb3702',
        mapStyle: 'Thunderforest.OpenCycleMap'
    }

    var Graphhopper = {
        apiKey: '83626281-4201-44fa-955a-95f88b2eb3eb',
        baseUrl: 'https://graphhopper.com/api/1/',
        routeUrl: 'route',
        geocodeUrl: 'geocode',
        provider: 'default',

        getGeoCodeSuggestion(input, jsonProcessor) {
            var url = this.baseUrl + this.geocodeUrl + '?key=' + this.apiKey + '&q=' + input + '&limit=5&provider=' + this.provider;
            fetch(url).then(function (response) {
                response.json().then(function (json) {
                    jsonProcessor(json);
                });
            });
        },

        getReversedGeoCodeSuggestion(point, jsonProcessor) {
            var url = this.baseUrl + this.geocodeUrl + '?key=' + this.apiKey + '&reverse=true&limit=1&point=' + point.lat + ',' + point.lng;
            fetch(url).then(function (response) {
                response.json().then(function (json) {
                    jsonProcessor(json);
                });
            });
        },

        getPath(points, jsonProcessor) {
            var url = this.baseUrl + this.routeUrl + '?key=' + this.apiKey + '&vehicle=bike&points_encoded=false';
            for (var i in points) {
                var pointString = points[i].lat + ',' + points[i].lng;
                url += '&point=' + pointString;
            }
            fetch(url).then(function (response) {
                response.json().then(function (json) {
                    jsonProcessor(json);
                });
            });
        }
    }

    var BRouter = {
        baseUrl: 'http://brouter.de/brouter',
        profileUrl: '/profile',
        profileFile: 'scripts/trekking.brf',
        profile: 'trekking',
        format: {
            geojson: 'geojson',
            gpx: 'gpx'
        },

        initProfile() {
            this.getProfile(this.uploadProfile);
        },

        getProfile(profileProcessor) {
            fetch(this.profileFile).then(function (response) {
                response.text().then(function (text) {
                    profileProcessor(text);
                });
            });
        },

        uploadProfile(text) {
            var url = BRouter.baseUrl + BRouter.profileUrl;
            fetch(url, {
                method: 'POST',
                body: text
            }).then(function (response) {
                response.json().then(function (json) {
                    BRouter.profile = json.profileid;
                    var event = $.Event('BRouterProfileChanged', {
                        profile: json.profileid
                    });
                    $(document).trigger(event);
                });
            });
        },

        getPath(points, jsonProcessor, errorProcessor) {
            var lonlats = 'lonlats=';
            lonlats += points[0].lng + ',' + points[0].lat + '|';
            lonlats += points[1].lng + ',' + points[1].lat
            var url = this.baseUrl + '?' + lonlats + '&format=' + this.format.geojson + '&alternativeidx=0&profile=' + BRouter.profile;
            fetch(url, {
                signal: abortController.signal
            }).then(response => {
                if (!response.ok) {
                    throw Error(response.status + ': ' + response.statusText);
                }
                if (response.headers.get('Content-Type').startsWith('text/plain')) {
                    throw Error('Content-Type: ' + response.headers.get('Content-Type'));
                }
                return response.json();
            }).then(json => {
                jsonProcessor(json);
            }).catch(error => {
                console.log(error);
                errorProcessor(error);
            });
        },

        getGpxPath(points, trackName, fileProcessor) {
            var lonlats = 'lonlats=';
            lonlats += points[0].lng + ',' + points[0].lat + '|';
            lonlats += points[1].lng + ',' + points[1].lat
            var url = this.baseUrl + '?' + lonlats + '&format=' + this.format.gpx + '&trackname=' + trackName + '&alternativeidx=0&profile=' + BRouter.profile;
            fetch(url).then(function (response) {
                response.blob().then(function (gpxFile) {
                    fileProcessor(gpxFile);
                });
            });
        },

        getGpxUrl(points, trackName) {
            var lonlats = 'lonlats=';
            lonlats += points[0].lng + ',' + points[0].lat + '|';
            lonlats += points[1].lng + ',' + points[1].lat
            var url = this.baseUrl + '?' + lonlats + '&format=' + this.format.gpx + '&trackname=' + trackName + '&alternativeidx=0&profile=' + BRouter.profile;
            return url;
        }

    }

    /**
     * close all geo suggestion popups (there should never be more than one)
     */
    function closeAllGeoSuggestions() {
        $('.autocomplete-items').remove()
    }

    /**
     * add listener for user inputs on start point
     */
    $('#start-point-input').on('input', function () {
        showGeoSuggestion('#start-point-input', $(this).val(), points);
    });

    /**
     * add listener for user inputs on end point
     */
    $('#end-point-input').on('input', function () {
        showGeoSuggestion('#end-point-input', $(this).val(), points);
    });

    /**
     * add listener to a click somewhere to close geo suggestions
     */
    $(document).on('click', function () {
        closeAllGeoSuggestions();
    });

    /**
     * close geo suggestions on ESC
     */
    $(document).keydown(function (event) {
        if (event.which == 27) {
            closeAllGeoSuggestions();
        }
    });

    /**
     * calculate route by click on the specified button
     */
    $('#calculate-route-button').on('click', function () {
        if (points.length != 2) {
            return;
        }
        Leaflet.removeLayer(currentPath);
        updateUrl(points);
        changeGoButtonStatus(false);
        showCancelButton();
        showPath(points);
    });

    $(window).on('popstate', function (event) {
        checkUrl();
    });

    $('#swap-route-input-button').on('click', function () {
        var startPoint = points[0];
        var startMarker = markers[0];
        var startText = $('#start-point-input').val();

        points[0] = points[1];
        markers[0] = markers[1];
        $('#start-point-input').val($('#end-point-input').val());

        points[1] = startPoint;
        markers[1] = startMarker;
        $('#end-point-input').val(startText);
    })

    /**
     *   get suggested geo locations based on user input
     */
    function showGeoSuggestion(inputFieldId, input, points) {
        // wait for the third letter from user
        if (input.length > 2) {
            Graphhopper.getGeoCodeSuggestion(input, function (json) {
                // close old suggestions before new one will be created
                closeAllGeoSuggestions();
                var hits = json.hits;

                // ##### create html structure
                var a = document.createElement('DIV');
                a.setAttribute('id', inputFieldId + 'autocomplete-list');
                a.setAttribute('class', 'autocomplete-items')
                $(inputFieldId).after(a);

                for (var i = 0; i < hits.length; i++) {
                    var hit = hits[i];
                    var b = document.createElement('DIV');
                    b.setAttribute('data-hit-id', i);
                    b.innerHTML = '<strong>' + hit.name.substr(0, input.length) + '</strong>';
                    b.innerHTML += hit.name.substr(input.length);
                    var subB = '';
                    subB += (hit.street == undefined ? '' : hit.street + ', ');
                    subB += (hit.city == undefined ? '' : hit.city + ', ');
                    subB += (hit.state == undefined ? '' : hit.state + ', ');
                    subB += hit.country;
                    b.innerHTML += '<br><i><small>' + subB + '</small></i>';
                    b.innerHTML += '<input type="hidden" value="' + hit.name + '">';
                    b.addEventListener('click', function (e) {
                        $(inputFieldId).val(this.getElementsByTagName('input')[0].value);
                        closeAllGeoSuggestions();
                        var pointIndex = $(inputFieldId).data('point-order');
                        Leaflet.removeLayer(markers[pointIndex]);
                        var geoLocation = hits[this.getAttribute('data-hit-id')];
                        points[pointIndex] = geoLocation.point;
                        markers[pointIndex] = Leaflet.addMarker(points[pointIndex]);
                        map.fitBounds(points, {
                            maxZoom: 14,
                            animate: true
                        });
                    });
                    a.appendChild(b);
                }
            });
        }
    }

    function showCancelButton() {
        $('#cancel-route-calc-wrapper').append('<button type="button" id="cancel-route-calc-button" class="btn btn-danger btn-block">Cancel</button>');
        $('#cancel-route-calc-button').on('click', function () {
            abortController.abort();
            abortController = new AbortController();
            changeGoButtonStatus(true);
            removeCancelButton();
        });
    }

    function removeCancelButton() {
        $('#cancel-route-calc-button').remove();
    }

    function showPath(points) {
        $('#sidebar-details-wrapper').empty();
        BRouter.getPath(points, function (json) {
            currentPath = Leaflet.addPath(json.features[0].geometry);
            removeCancelButton();
            map.fitBounds(points);
            showDetails(json.features[0].properties);
            showDownloadButton(points);
        }, function (error) {
            changeGoButtonStatus(true);
            if (error.name != "AbortError") {
                $('#route-error-modal > .modal-dialog > .modal-content > .modal-body > p').empty();
                console.log(error.message);
                $('#route-error-modal > .modal-dialog > .modal-content > .modal-body > p').append(error.message);
                $('#route-error-modal').modal();
            }
        });
    }

    /**
     * display route instructions on sidebar
     */
    function showDetails(properties) {
        changeGoButtonStatus(true);
        // $('#sidebar-details-wrapper').empty();
        var table = '<table class="table table-dark table-borderless"><tbody>';

        var distance = Math.round(properties['track-length'] / 100) / 10;
        table += '<tr><th>Distance</th><td>' + distance + ' km</td></tr>';

        var travelTime = Math.round(properties['total-time'] / 60);
        var minutes = travelTime % 60;
        var hours = (travelTime - minutes) / 60;
        table += '<tr><th>Travel time</th><td>' + hours + 'h ' + minutes + 'min</td></tr>';

        var elevationFiltered = properties['filtered ascend'];
        table += '<tr><th>Elevation overall</th><td>' + elevationFiltered + ' m</td></tr>';

        var elevationPlain = properties['plain-ascend'];
        table += '<tr><th>Elevation simplified</th><td>' + elevationPlain + ' m</td></tr>';

        table += '</tbody></table>';
        $('#sidebar-details-wrapper').append(table);
    }

    function showDownloadButton(points) {
        var startPoint = $('#start-point-input').val();
        var endPoint = $('#end-point-input').val();
        var trackName = startPoint + '_' + endPoint;
        var button = '<a href="' + BRouter.getGpxUrl(points, trackName) + '" id="download-route-button" role="button" class="btn btn-primary btn-block">Download as GPX</a>';
        $('#sidebar-details-wrapper').append(button);
    }

    function changeGoButtonStatus(isEnabled) {
        if (isEnabled) {
            $('#calculate-route-button').empty();
            $('#calculate-route-button').append('Go');
            $('#calculate-route-button').prop('disabled', false);
        } else {
            $('#calculate-route-button').empty();
            $('#calculate-route-button').append('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...');
            $('#calculate-route-button').prop('disabled', true);
        }
    }

    function checkUrl() {
        var url = new URL(window.location);
        var urlParams = url.searchParams;
        var routeNeedsReload = false;
        if (urlParams.get('start') != undefined) {
            var startParam = urlParams.get('start').split(',');
            if (startParam.length == 2) {
                var startPoint = new Point(startParam[0], startParam[1]);
                if (points[0] != startPoint) {
                    points[0] = startPoint;
                    Graphhopper.getReversedGeoCodeSuggestion(startPoint, function (json) {
                        $('#start-point-input').val(json.hits[0].name);
                    });
                    markers[0] = Leaflet.addMarker(points[0]);
                    routeNeedsReload = true;
                }
            }
        }
        if (urlParams.get('end') != undefined) {
            var endParam = urlParams.get('end').split(',');
            if (endParam.length == 2) {
                var endPoint = new Point(endParam[0], endParam[1]);
                if (points[1] != endPoint) {
                    points[1] = endPoint;
                    Graphhopper.getReversedGeoCodeSuggestion(endPoint, function (json) {
                        $('#end-point-input').val(json.hits[0].name);
                    });
                    markers[1] = Leaflet.addMarker(points[1]);
                    routeNeedsReload = true;
                }
            }
        }
        map.fitBounds(points, {
            maxZoom: 14,
            animate: true
        });
        if (routeNeedsReload && points[0] != undefined && points[1] != undefined) {
            Leaflet.removeLayer(currentPath);
            changeGoButtonStatus(false);
            showCancelButton();
            showPath(points);
        }
    }

    function updateUrl(points) {
        var url = new URL(window.location);
        var urlParams = url.searchParams;
        urlParams.set('start', points[0].lat + ',' + points[0].lng);
        urlParams.set('end', points[1].lat + ',' + points[1].lng);
        url.searchParams = urlParams;
        window.history.pushState('myData', 'Neue Route', url.pathname + url.search);
    }

    Leaflet.initMap();
    BRouter.initProfile();
    // wait until profile is loaded
    $(document).on('BRouterProfileChanged', function () {
        console.log('profile ' + BRouter.profile + ' is loaded');
        checkUrl();
    });
});