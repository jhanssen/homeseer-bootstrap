/*global angular,WebSocket,setTimeout*/
function Homeseer(uri) {
    this._uri = uri;
    this._createWebSocket();
};

Homeseer.WithId = 0;
Homeseer.WithoutId = 1;

Homeseer.prototype = {
    _url: undefined,
    _ws: undefined,
    _id: 0,
    _connectTimeout: undefined,
    _cbs: Object.create(null),
    _ons: Object.create(null),

    _createWebSocket: function() {
        var that = this;
        this._ws = new WebSocket(that._uri);
        this._ws.onopen = function() {
            that._connectTimeout = undefined;
            that._callOn("connected");
            that._request({type: "events"});
        };
        this._ws.onclose = function() {
            // try to reconnect with an exponential backoff
            that._callOn("disconnected");
            if (that._connectTimeout === undefined)
                that._connectTimeout = 500;
            setTimeout(function() {
                if (that._connectTimeout < 64000)
                    that._connectTimeout *= 2;
                that._createWebSocket();
            }, that._connectTimeout);
        };
        this._ws.onerror = function(err) {
            if (that._connectTimeout !== undefined) {
                setTimeout(function() {
                    if (that._connectTimeout < 64000)
                        that._connectTimeout *= 2;
                    that._createWebSocket();
                }, that._connectTimeout);
            }
        };
        this._ws.onmessage = function(data) {
            try {
                var msg = JSON.parse(data.data);
            } catch (e) {
                console.error("onmessage exception", e);
                return;
            }
            if ("id" in msg) {
                // do we have a callback?
                if (that._callCb(msg))
                    return;
            }
            switch (msg.type) {
            case "events":
                that._callOn("events", msg.events);
                break;
            default:
                console.error(msg);
                break;
            }
        };
    },
    _request: function(req, flags, cb) {
        if (this._ws.readyState !== 1)
            return;
        if (flags === undefined || flags === Homeseer.WithId) {
            var id = ++this._id;
            req.id = id;
            if (cb)
                this._cbs[id] = cb;
        }
        this._ws.send(JSON.stringify(req));
    },
    _callOn: function(type, arg) {
        if (type in this._ons) {
            this._ons[type].call(this, arg);
        }
    },
    _callCb: function(msg) {
        if (msg.id in this._cbs) {
            var cb = this._cbs[msg.id];
            delete this._cbs[msg.id];
            if (typeof cb === "function") {
                cb(msg);
                return true;
            }
        }
        return false;
    },

    on: function(type, cb) {
        this._ons[type] = cb;
    },
    toggleScene: function(id) {
        this._request({ type: "fire", event: id });
    }
};

var app, hs;
(function () {
    hs = new Homeseer("ws://pi.nine.ms:8087/homeseer/");
    app = angular.module("homeseer", ["ui.bootstrap"]);
    app.controller("MainController", function($scope) {
        $scope.enabled = false;
        hs.on("connected", function() {
            $scope.enabled = true;
            $scope.$apply();
        });
        hs.on("disconnected", function() {
            $scope.enabled = false;
            if ("scenes" in $scope)
                delete $scope.scenes;
            $scope.$apply();
        });
        hs.on("events", function(events) {
            for (var i = 0; i < events.length; ++i) {
                if (events[i].groupName === "scenes") {
                    $scope.scenes = events[i].events;
                    $scope.$apply();
                    break;
                }
            }
        });
        $scope.toggleScene = function(id) { hs.toggleScene(id); };
    });
})();
