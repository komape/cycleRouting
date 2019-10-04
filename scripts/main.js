$(document).ready(function () {

    website.extAPIs.Leaflet.initMap();
    website.extAPIs.BRouter.initProfile();
    // wait until profile is loaded
    $(document).on('BRouterProfileChanged', function () {
        console.log('profile ' + website.extAPIs.BRouter.profileId + ' is loaded');
        website.checkUrl();
    });

    // ####### listeners for geo suggestion handling
    $('#route-form').on('input', '.point-input', function () {
        website.showGeoSuggestion($(this), $(this).val(), website.points);
    });

    $(document).on('click', function () {
        website.closeAllGeoSuggestions();
    });

    $(document).keydown(function (event) {
        if (event.which == 27) {
            website.closeAllGeoSuggestions();
        }
    });
    // ####### 

    /**
     * calculate route button listener
     */
    $('#calculate-route-button').on('click', function () {
        if (website.points.length < 2) {
            return;
        }
        website.extAPIs.Leaflet.removeLayer(website.currentPath);
        website.updateUrl(website.points);
        website.changeGoButtonStatus(false);
        website.showCancelButton();
        website.showPath(website.points);
    });

    $(window).on('popstate', function (event) {
        website.checkUrl();
    });

    $('#swap-route-input-button').on('click', function () {
        var startPoint = website.points[0];
        var startMarker = website.markers[0];
        var startText = $('#point-input-A').val();

        website.points[0] = website.points[1];
        website.markers[0] = website.markers[1];
        $('#point-input-A').val($('#point-input-B').val());

        website.points[1] = startPoint;
        website.markers[1] = startMarker;
        $('#point-input-B').val(startText);
    });

    $('#add-route-point-button').on('click', function () {
        var formRowString = '<div class="form-group row">';
        formRowString += '<label for="point-1" class="col-1 col-form-label">1</label>';
        formRowString += '<div class="col point-input-wrapper" style="padding-right: 2px">';
        formRowString += '<input class="form-control point-input" type="search" name="point-1" placeholder="Zwischenziel">';
        formRowString += '</div>';
        formRowString += '<div class="col-2" style="padding-left: 2px">';
        formRowString += '<button type="button" class="btn btn-danger btn-block remove-input-btn font-weight-bold">&#xd7;</button>';
        formRowString += '</div>';
        formRowString += '</div>';
        $('#point-input-B').parent().parent().before(formRowString);
    });

    $('#route-form').on('click', '.remove-input-btn', function () {
        $(this).parent().parent().remove();
    });
});

class Point {
    constructor(lat, lng) {
        this.lat = lat;
        this.lng = lng;
    }
}

var website = {
    // map element
    map: undefined,

    // points for path
    points: new Array(),
    markers: new Array(),

    // current shown path
    currentPath: undefined,

    // controller to cancel fetch requests
    abortController: new AbortController(),

    extAPIs: {

        Leaflet: {

            baseCenter: [51, 10],
            baseZoom: 5,

            defaultPathStyle: {
                weight: 8,
                opacity: .75
            },

            Thunderforest: {
                apiKey: '06ca471c8d2d4e1cac753d9556cb3702',
                mapStyle: 'Thunderforest.OpenCycleMap'
            },

            initMap() {
                website.map = L.map('map').setView(this.baseCenter, this.baseZoom);
                L.tileLayer.provider(this.Thunderforest.mapStyle, {
                    apikey: this.Thunderforest.apiKey
                }).addTo(website.map);
                L.control.scale().addTo(website.map);
            },

            addMarker(coordinates) {
                return L.marker(coordinates).addTo(website.map);
            },

            removeLayer(layer) {
                if (layer != undefined) {
                    website.map.removeLayer(layer);
                }
            },

            flyToMarker(marker) {
                website.map.flyTo(marker.getLatLng())
            },

            addPath(geoJsonFeature, style = this.defaultPathStyle) {
                return L.geoJson(geoJsonFeature, {
                    style: style
                }).addTo(website.map);
            }
        },


        Graphhopper: {
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
        },

        BRouter: {
            baseUrl: 'http://brouter.de/brouter',
            profileUrl: '/profile',
            profileFile: 'scripts/trekking.brf',
            profileId: 'trekking',
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
                var url = website.extAPIs.BRouter.baseUrl + website.extAPIs.BRouter.profileUrl;
                fetch(url, {
                    method: 'POST',
                    body: text
                }).then(function (response) {
                    response.json().then(function (json) {
                        website.extAPIs.BRouter.profile = json.profileid;
                        var event = $.Event('BRouterProfileChanged', {
                            profileId: json.profileid
                        });
                        $(document).trigger(event);
                    });
                });
            },

            getPath(points, jsonProcessor, errorProcessor) {
                var lonlats = 'lonlats=';
                lonlats += points[0].lng + ',' + points[0].lat + '|';
                lonlats += points[1].lng + ',' + points[1].lat
                var url = this.baseUrl + '?' + lonlats + '&format=' + this.format.geojson + '&alternativeidx=0&profile=' + this.profileId;
                fetch(url, {
                    signal: website.abortController.signal
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
                var url = this.baseUrl + '?' + lonlats + '&format=' + this.format.gpx + '&trackname=' + trackName + '&alternativeidx=0&profile=' + website.extAPIs.BRouter.profile;
                return url;
            }

        },
    },

    // all the meta stuff such as url updates

    checkUrl() {
        var url = new URL(window.location);
        var urlParams = url.searchParams;
        var routeNeedsReload = false;
        if (urlParams.get('a') != undefined) {
            var startParam = urlParams.get('a').split(',');
            if (startParam.length == 2) {
                var startPoint = new Point(startParam[0], startParam[1]);
                if (website.points[0] != startPoint) {
                    website.points[0] = startPoint;
                    website.extAPIs.Graphhopper.getReversedGeoCodeSuggestion(startPoint, function (json) {
                        $('#point-input-A').val(json.hits[0].name);
                        $('#point-input-A').data('geoLocation', json.hits[0]);
                    });
                    website.markers[0] = website.extAPIs.Leaflet.addMarker(website.points[0]);
                    routeNeedsReload = true;
                }
            }
        }
        if (urlParams.get('b') != undefined) {
            var endParam = urlParams.get('b').split(',');
            if (endParam.length == 2) {
                var endPoint = new Point(endParam[0], endParam[1]);
                if (this.points[1] != endPoint) {
                    this.points[1] = endPoint;
                    this.extAPIs.Graphhopper.getReversedGeoCodeSuggestion(endPoint, function (json) {
                        $('#point-input-B').val(json.hits[0].name);
                        $('#point-input-B').data('geoLocation', json.hits[0]);
                    });
                    this.markers[1] = this.extAPIs.Leaflet.addMarker(this.points[1]);
                    routeNeedsReload = true;
                }
            }
        }
        if (routeNeedsReload && this.points[0] != undefined && this.points[1] != undefined) {
            this.map.fitBounds(this.points, {
                maxZoom: 14,
                animate: true,
            });
            this.extAPIs.Leaflet.removeLayer(this.currentPath);
            this.changeGoButtonStatus(false);
            this.showCancelButton();
            this.showPath(this.points);
        }
    },

    updateUrl(points) {
        var url = new URL(window.location);
        var urlParams = url.searchParams;
        urlParams.set('a', points[0].lat + ',' + points[0].lng);
        urlParams.set('b', points[1].lat + ',' + points[1].lng);
        url.searchParams = urlParams;
        window.history.pushState('myData', 'New Route', url.pathname + url.search);
    },

    // everything that belongs into the sidebar

    /**
     * close all geo suggestion popups (there should never be more than one)
     */
    closeAllGeoSuggestions() {
        $('.autocomplete-items').remove()
    },

    /*
     *   get suggested geo locations based on user input
     */
    showGeoSuggestion(inputFieldId, input, points) {
        // wait for the third letter from user
        if (input.length > 2) {
            website.extAPIs.Graphhopper.getGeoCodeSuggestion(input, function (json) {
                website.closeAllGeoSuggestions();
                // close old suggestions before new one will be created
                var hits = json.hits;

                // ##### create html structure
                var hitElementsWrapper = $('<div></div>', {
                    'class': 'autocomplete-items text-dark',
                    'id': inputFieldId.attr('id') + '-autocomplete-list'
                }).insertAfter(inputFieldId);

                for (var i = 0; i < hits.length; i++) {
                    var hit = hits[i];
                    var hitElemHtml = hit.name;
                    hitElemHtml += '<br><i><small>';
                    hitElemHtml += (hit.street == undefined ? '' : hit.street + ', ');
                    hitElemHtml += (hit.city == undefined ? '' : hit.city + ', ');
                    hitElemHtml += (hit.postcode == undefined ? '' : hit.postcode + ' ');
                    hitElemHtml += (hit.state == undefined ? '' : hit.state + ', ');
                    hitElemHtml += hit.country;
                    hitElemHtml += '</small></i>';
                    hitElemHtml += '<input type="hidden" value="' + hit.name + '">';
                    var hitElem = $('<div></div>', {
                        'html': hitElemHtml
                    });
                    $(hitElem).attr('hitIdx', i);
                    hitElem.on('click', function () {
                        var pointIdx = 0;
                        $('.point-input').each(function (idx) {
                            if ($(this).is(inputFieldId)) {
                                pointIdx = idx;
                            }
                        });
                        website.closeAllGeoSuggestions();
                        var geoLocation = hits[$(this).attr('hitIdx')];
                        $(inputFieldId).data('geoLocation', geoLocation);
                        $(inputFieldId).val(geoLocation.name);
                        website.points[pointIdx] = geoLocation.point;

                        website.extAPIs.Leaflet.removeLayer(website.markers[pointIdx]);
                        website.markers[pointIdx] = website.extAPIs.Leaflet.addMarker(website.points[pointIdx]);
                        website.map.fitBounds(website.points, {
                            maxZoom: 14,
                            animate: true
                        });
                    });
                    hitElem.appendTo(hitElementsWrapper);
                }
            });
        }
    },

    showCancelButton() {
        $('#cancel-route-calc-wrapper').append('<button type="button" id="cancel-route-calc-button" class="btn btn-danger btn-block">Cancel</button>');
        $('#cancel-route-calc-button').on('click', function () {
            website.abortController.abort();
            website.abortController = new AbortController();
            website.changeGoButtonStatus(true);
            website.removeElevationProfile();
            website.removeCancelButton();
        });
    },

    removeCancelButton() {
        $('#cancel-route-calc-button').remove();
    },

    /**
     * display route instructions on sidebar
     */
    showDetails(properties) {
        this.changeGoButtonStatus(true);
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
    },

    showDownloadButton(points) {
        var startPoint = $('#start-point-input').val();
        var endPoint = $('#end-point-input').val();
        var trackName = startPoint + '_' + endPoint;
        var button = '<a href="' + this.extAPIs.BRouter.getGpxUrl(points, trackName) + '" id="download-route-button" role="button" class="btn btn-primary btn-block">Download as GPX</a>';
        $('#sidebar-details-wrapper').append(button);
    },

    changeGoButtonStatus(isEnabled) {
        $('#calculate-route-button').empty();
        if (isEnabled) {
            $('#calculate-route-button').append('Go');
        } else {
            $('#calculate-route-button').append('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...');
        }
        $('#calculate-route-button').prop('disabled', !isEnabled);
    },

    // everything that belongs to the map

    showPath(points) {
        $('#sidebar-details-wrapper').empty();
        website.extAPIs.BRouter.getPath(points, function (json) {
            website.currentPath = website.extAPIs.Leaflet.addPath(json.features[0].geometry);
            website.removeCancelButton();
            website.map.fitBounds(points);
            website.showDetails(json.features[0].properties);
            website.showDownloadButton(points);
            website.showElevationProfile(json.features[0].geometry.coordinates);
        }, function (error) {
            website.changeGoButtonStatus(true);
            if (error.name != "AbortError") {
                $('#route-error-modal > .modal-dialog > .modal-content > .modal-body > p').empty();
                console.log(error.message);
                $('#route-error-modal > .modal-dialog > .modal-content > .modal-body > p').append(error.message);
                $('#route-error-modal').modal();
            }
        });
    },

    // everything that belongs to the elevation profile

    showElevationProfile(coordinates) {
        $('#elev-profile-chart-wrapper').empty();
        $('#elev-profile-chart-wrapper').append('<canvas id="elev-profile-chart"></canvas>');
        $('#sidebar-details-wrapper').append('<p id="elev-hint">↧ Scroll for elevation profile ↧</p>');
        var points = this.convertMessagesToPointsForChart(coordinates);
        new Chart($('#elev-profile-chart'), {
            type: 'line',
            data: {
                labels: points.map((elem) => elem.x),
                fillOpacity: .7,
                datasets: [{
                    data: points,
                    backgroundColor: '#33cccc',
                    borderColor: '#ff6699',
                    fill: true,
                    pointRadius: 0
                }]
            },
            options: {
                legend: {
                    display: false
                },
                scales: {
                    xAxes: [{
                        type: 'linear',
                        scaleLabel: {
                            display: true,
                            labelString: 'distance in km',
                            fontColor: '#f8f9fa'
                        },
                        ticks: {
                            fontColor: '#f8f9fa',
                            max: Math.ceil(points[points.length - 1].x)
                        },
                        gridLines: {
                            display: false,
                            drawBorder: false
                        }
                    }],
                    yAxes: [{
                        type: 'linear',
                        scaleLabel: {
                            display: true,
                            labelString: 'elevation in m',
                            fontColor: '#f8f9fa'
                        },
                        ticks: {
                            fontColor: '#f8f9fa',
                            beginAtZero: true
                        },
                        gridLines: {
                            display: false,
                            drawBorder: false
                        }
                    }]
                },
                maintainAspectRatio: false,
                responsive: true
            }
        });
    },

    removeElevationProfile() {
        $('#elev-profile-chart-wrapper').empty();
        $('#elev-profile-chart-wrapper').append('<h3 class="text-center>Enter a Route to get the elevation profile<h3>');
    },

    convertMessagesToPointsForChart(coordinates) {
        var points = new Array(coordinates.length - 1);
        var distanceSum = 0;
        points[0] = {
            x: distanceSum,
            y: coordinates[0][2]
        }
        for (var i = 1; i < coordinates.length; i++) {
            var lat1 = coordinates[i - 1][1];
            var lng1 = coordinates[i - 1][0];
            var lat2 = coordinates[i][1];
            var lng2 = coordinates[i][0];
            var dy = 111.3 * (lat1 - lat2);
            var lat = (lat1 + lat2) / 2 * 0.01745;
            var dx = 111.3 * Math.cos(lat) * (lng1 - lng2);
            var distance = Math.sqrt(dx * dx + dy * dy);
            distanceSum += distance;
            points[i - 1] = {
                x: distanceSum,
                y: +coordinates[i][2]
            }
        }
        return points;
    },
}