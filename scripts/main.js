$(document).ready(function () {

    website.extAPIs.Leaflet.initMap();
    website.extAPIs.BRouter.initProfile();
    // wait until profile is loaded
    $(document).on('BRouterProfileChanged', function () {
        console.log('profile ' + website.extAPIs.BRouter.profileId + ' is loaded');
        website.checkUrl();
        if (website.points.a != undefined && website.points.b != undefined) {
            website.startRouteCalculation();
        }
    });

    // ####### listeners for geo suggestion handling
    $('#route-form').on('input', '.point-input', function () {
        website.showGeoSuggestion($(this), $(this).val());
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
        if (website.points.a == undefined || website.points.b == undefined) {
            return;
        }
        website.updateUrl();
        website.extAPIs.Leaflet.removeLayer(website.currentPath);
        website.startRouteCalculation();
    });

    $(window).on('popstate', function (event) {
        website.checkUrl();
        if (website.points.a != undefined && website.points.b != undefined) {
            website.startRouteCalculation();
        }
    });

    $('#swap-route-input-button').on('click', function () {
        var startPoint = website.points.a;
        var startMarker = website.markers.a;
        var startText = $('#point-input-A').val();

        website.points.a = website.points.b;
        website.markers.a = website.markers.b;
        $('#point-input-A').val($('#point-input-B').val());

        website.points.b = startPoint;
        website.markers.b = startMarker;
        $('#point-input-B').val(startText);
    });

    $('#add-route-point-button').on('click', function () {
        var stopoverIdx = $('.stopover-input').length;
        website.addStopoverInput(stopoverIdx);
    });

    $('#route-form').on('click', '.remove-input-btn', function () {
        const pointId = $(this).parent().prev().children().data('pointid');
        website.points.stopovers.splice(pointId, 1);
        const removedMarker = website.markers.stopovers.splice(pointId, 1)
        website.extAPIs.Leaflet.removeLayer(removedMarker[0]);
        $(this).parent().parent().remove();
        $('.stopover-input').each(function (stopoverIdx, elem) {
            if (stopoverIdx >= pointId) {
                $(this).attr('name', `point-${+stopoverIdx + 1}`);
                $(this).attr('data-pointId', stopoverIdx);
                $(this).parent().prev().attr('for', `point-${+stopoverIdx + 1}`).text(+stopoverIdx + 1);
            }
        });
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
    points: {
        a: undefined,
        b: undefined,
        stopovers: []
    },
    markers: {
        a: undefined,
        b: undefined,
        stopovers: []
    },

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

            getReversedGeoCodeSuggestion(point, jsonProcessor, index) {
                var url = this.baseUrl + this.geocodeUrl + '?key=' + this.apiKey + '&reverse=true&limit=1&point=' + point.lat + ',' + point.lng;
                fetch(url).then(function (response) {
                    response.json().then(function (json) {
                        jsonProcessor(json, index);
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
                        website.extAPIs.BRouter.profileId = json.profileid;
                        var event = $.Event('BRouterProfileChanged', {
                            profileId: json.profileid
                        });
                        $(document).trigger(event);
                    });
                });
            },

            async getWholePath(points, errorProcessor) {
                var isValidPath = false;
                var path = {
                    properties: {
                        trackLength: 0,
                        filteredAscend: 0,
                        plainAscend: 0,
                        totalTime: 0,
                        cost: 0,
                    },
                    geometry: {
                        type: 'LineString',
                        coordinates: []
                    }
                };

                if (points.stopovers == undefined || points.stopovers.length == 0) {
                    var lonlats = 'lonlats=';
                    lonlats += points.a.lng + ',' + points.a.lat + '|';
                    lonlats += points.b.lng + ',' + points.b.lat
                    const url = this.baseUrl + '?' + lonlats + '&format=' + this.format.geojson + '&alternativeidx=0&profile=' + this.profileId;
                    const feature = await this.getPathSegement(url, errorProcessor);
                    if (feature != undefined) {
                        path = this.addFeatureToPath(path, feature);
                        isValidPath = true;
                    }
                } else {
                    for (var i = 0; i <= points.stopovers.length; i++) {
                        var lonlats = 'lonlats=';
                        if (i == 0) {
                            lonlats += points.a.lng + ',' + points.a.lat + '|';
                            lonlats += points.stopovers[i].lng + ',' + points.stopovers[i].lat;
                        } else if (i == points.stopovers.length) {
                            lonlats += points.stopovers[i - 1].lng + ',' + points.stopovers[i - 1].lat + '|';
                            lonlats += points.b.lng + ',' + points.b.lat;
                        } else {
                            lonlats += points.stopovers[i - 1].lng + ',' + points.stopovers[i - 1].lat + '|';
                            lonlats += points.stopovers[i].lng + ',' + points.stopovers[i].lat;
                        }
                        const url = this.baseUrl + '?' + lonlats + '&format=' + this.format.geojson + '&alternativeidx=0&profile=' + this.profileId;
                        const feature = await this.getPathSegement(url, errorProcessor);
                        if (feature != undefined) {
                            path = this.addFeatureToPath(path, feature);
                            isValidPath = true;
                        }
                    }
                }
                return isValidPath ? path : undefined;
            },

            async getPathSegement(url, errorProcessor) {
                var response = await fetch(url, {
                    signal: website.abortController.signal
                });
                try {
                    if (!response.ok) {
                        throw Error(response.status + ': ' + response.statusText);
                    }
                    if (response.headers.get('Content-Type').startsWith('text/plain')) {
                        let text = await response.text();
                        throw Error(text);
                    }
                } catch (error) {
                    console.log(error);
                    errorProcessor(error);
                    return;
                }
                var json = await response.json();
                return json.features[0];
            },

            getGpxPath(points, trackName, fileProcessor) {
                var lonlats = 'lonlats=';
                lonlats += points.a.lng + ',' + points.a.lat + '|';
                lonlats += points.b.lng + ',' + points.b.lat
                var url = this.baseUrl + '?' + lonlats + '&format=' + this.format.gpx + '&trackname=' + trackName + '&alternativeidx=0&profile=' + BRouter.profile;
                fetch(url).then(function (response) {
                    response.blob().then(function (gpxFile) {
                        fileProcessor(gpxFile);
                    });
                });
            },

            getGpxUrl(points, trackName) {
                var lonlats = 'lonlats=';
                lonlats += points.a.lng + ',' + points.a.lat + '|';
                lonlats += points.b.lng + ',' + points.b.lat
                var url = this.baseUrl + '?' + lonlats + '&format=' + this.format.gpx + '&trackname=' + trackName + '&alternativeidx=0&profile=' + website.extAPIs.BRouter.profile;
                return url;
            },

            addFeatureToPath(path, featureJson) {
                path.properties.trackLength += +featureJson.properties['track-length'];
                path.properties.filteredAscend += +featureJson.properties['filtered ascend'];
                path.properties.plainAscend += +featureJson.properties['plain-ascend'];
                path.properties.totalTime += +featureJson.properties['total-time'];
                path.properties.totalEnergy += +featureJson.properties['total-energy'];
                path.properties.cost += +featureJson.properties['cost'];

                path.geometry.coordinates.push(...featureJson.geometry.coordinates);

                return path;
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
                if (website.points.a != startPoint) {
                    website.points.a = startPoint;
                    website.extAPIs.Graphhopper.getReversedGeoCodeSuggestion(startPoint, function (json) {
                        $('#point-input-A').val(json.hits[0].name);
                        $('#point-input-A').data('geoLocation', json.hits[0]);
                    });
                    website.markers.a = website.extAPIs.Leaflet.addMarker(startPoint);
                    routeNeedsReload = true;
                }
            }
        }
        var i = 0;
        while (urlParams.has(i)) {
            var stopoverParam = urlParams.get(i).split(',');
            if (stopoverParam.length == 2) {
                this.addStopoverInput(i);
                var stopoverPoint = new Point(stopoverParam[0], stopoverParam[1]);
                if (website.points.stopovers != stopoverPoint) {
                    website.points.stopovers[i] = stopoverPoint;
                    website.extAPIs.Graphhopper.getReversedGeoCodeSuggestion(stopoverPoint, function (json, idx) {
                        $(`#point-input-${idx + 1}`).val(json.hits[0].name);
                    }, i);
                    website.markers.stopovers[i] = website.extAPIs.Leaflet.addMarker(stopoverPoint);
                    routeNeedsReload = true;
                }
            }
            i++;
        }
        if (urlParams.get('b') != undefined) {
            var endParam = urlParams.get('b').split(',');
            if (endParam.length == 2) {
                var endPoint = new Point(endParam[0], endParam[1]);
                if (this.points.b != endPoint) {
                    this.points.b = endPoint;
                    this.extAPIs.Graphhopper.getReversedGeoCodeSuggestion(endPoint, function (json) {
                        $('#point-input-B').val(json.hits[0].name);
                        $('#point-input-B').data('geoLocation', json.hits[0]);
                    });
                    this.markers.b = this.extAPIs.Leaflet.addMarker(endPoint);
                    routeNeedsReload = true;
                }
            }
        }
        this.fitBounds();
        if (routeNeedsReload && this.points.a != undefined && this.points.b != undefined) {
            this.extAPIs.Leaflet.removeLayer(this.currentPath);
        }
    },

    updateUrl() {
        var url = new URL(window.location);
        var urlParams = url.searchParams;

        urlParams.delete('a')
        if (this.points.a != undefined) {
            const key = 'a';
            urlParams.set(key, this.points.a.lat + ',' + this.points.a.lng);
        }
        var i = 0;
        while (urlParams.has(i)) {
            urlParams.delete(i++);
        }
        if (this.points.stopovers.length > 0) {
            for (var i in this.points.stopovers) {
                const point = this.points.stopovers[i];
                const key = i;
                urlParams.set(key, point.lat + ',' + point.lng);
            }
        }
        urlParams.delete('b')
        if (this.points.b != undefined) {
            const key = 'b';
            urlParams.set(key, this.points.b.lat + ',' + this.points.b.lng);
        }
        url.searchParams = urlParams;
        window.history.pushState('myData', 'New Route', url.pathname + url.search);
    },

    showErrorModal(error) {
        $('#route-error-modal > .modal-dialog > .modal-content > .modal-body > p').empty();
        console.log(error.message);
        $('#route-error-modal > .modal-dialog > .modal-content > .modal-body > p').append(error.message);
        $('#route-error-modal').modal();
    },

    async startRouteCalculation() {
        this.changeGoButtonStatus(false);
        $('#sidebar-details-wrapper').empty();
        const path = await website.extAPIs.BRouter.getWholePath(this.points, function (error) {
            website.changeGoButtonStatus(true);
            if (error.name != 'AbortError') {
                website.showErrorModal(error);
            }
        });
        if (path != undefined) {
            website.currentPath = website.extAPIs.Leaflet.addPath(path.geometry);
            website.fitBounds();
            website.showDetails(path.properties);
            website.showDownloadButton(this.points);
            website.showElevationProfile(path.geometry.coordinates);
        }
    },

    // everything that belongs into the sidebar

    addStopoverInput(stopoverIdx) {
        var formRowString = '<div class="form-group row">';
        formRowString += `<label for="point-${+stopoverIdx + 1}" class="col-1 col-form-label">${+stopoverIdx + 1}</label>`;
        formRowString += '<div class="col point-input-wrapper" style="padding-right: 2px">';
        formRowString += `<input class="form-control point-input stopover-input" type="search" name="point-${+stopoverIdx + 1}" id="point-input-${+stopoverIdx + 1}" placeholder="Zwischenziel" data-pointid="${stopoverIdx}">`;
        formRowString += '</div>';
        formRowString += '<div class="col-2" style="padding-left: 2px">';
        formRowString += '<button type="button" class="btn btn-danger btn-block remove-input-btn font-weight-bold">&#xd7;</button>';
        formRowString += '</div>';
        formRowString += '</div>';
        // $('#point-input-B').parent().parent().before(formRowString);
        $('#route-form > div:nth-child(' + (stopoverIdx + 1) + ')').after(formRowString);
    },

    /**
     * close all geo suggestion popups (there should never be more than one)
     */
    closeAllGeoSuggestions() {
        $('.autocomplete-items').remove()
    },

    /*
     *   get suggested geo locations based on user input
     */
    showGeoSuggestion(inputField, input) {
        // wait for the third letter from user
        if (input.length > 2) {
            website.extAPIs.Graphhopper.getGeoCodeSuggestion(input, function (json) {
                website.closeAllGeoSuggestions();
                // close old suggestions before new one will be created
                var hits = json.hits;

                // ##### create html structure
                var hitElementsWrapper = $('<div></div>', {
                    'class': 'autocomplete-items text-dark',
                    'id': inputField.attr('id') + '-autocomplete-list'
                }).insertAfter(inputField);

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
                        var pointId = '';
                        $('.point-input').each(function (idx) {
                            if ($(this).is(inputField)) {
                                pointId = $(this).data('pointid');
                            }
                        });
                        website.closeAllGeoSuggestions();
                        var geoLocation = hits[$(this).attr('hitIdx')];
                        var marker = website.extAPIs.Leaflet.addMarker(geoLocation.point);
                        $(inputField).data('geoLocation', geoLocation);
                        $(inputField).val(geoLocation.name);
                        if (isNaN(pointId)) {
                            website.points[pointId] = geoLocation.point;
                            website.extAPIs.Leaflet.removeLayer(website.markers[pointId]);
                            website.markers[pointId] = marker;
                        } else {
                            website.points.stopovers[pointId] = geoLocation.point;
                            website.extAPIs.Leaflet.removeLayer(website.markers.stopovers[pointId]);
                            website.markers.stopovers[pointId] = marker;
                        }
                        website.fitBounds();
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

        var distance = Math.round(properties.trackLength / 100) / 10;
        table += '<tr><th>Distance</th><td>' + distance + ' km</td></tr>';

        var travelTime = Math.round(properties.totalTime / 60);
        var minutes = travelTime % 60;
        var hours = (travelTime - minutes) / 60;
        table += '<tr><th>Travel time</th><td>' + hours + 'h ' + minutes + 'min</td></tr>';

        var elevationFiltered = properties.filteredAscend;
        table += '<tr><th>Elevation overall</th><td>' + elevationFiltered + ' m</td></tr>';

        var elevationPlain = properties.plainAscend;
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
            website.removeCancelButton();
        } else {
            $('#calculate-route-button').append('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...');
            website.showCancelButton();
        }
        $('#calculate-route-button').prop('disabled', !isEnabled);
    },

    // everything that belongs to the map

    fitBounds() {
        var pointsArr = [];
        if (this.points.a != undefined) {
            pointsArr.push(this.points.a);
        }
        if (this.points.stopovers.length != 0) {
            pointsArr.push(...this.points.stopovers);
        }
        if (this.points.b != undefined) {
            pointsArr.push(this.points.b);
        }
        if (pointsArr.length != 0) {
            this.map.fitBounds(pointsArr, {
                maxZoom: 14,
                animate: true
            });
        }
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
        $('#elev-profile-chart-wrapper').append('<h3 class="text-center lead"><br>Enter a Route to get the elevation profile<h3>');
    },

    convertMessagesToPointsForChart(coordinates) {
        var points = new Array(coordinates.length - 1);
        var distanceSum = 0;
        points.a = {
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