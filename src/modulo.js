/*
 * Modulo v1.0.0
 * (c) 2020 Fritz Ramirez
*/
(function(global, factory) {
    // Test
    // Another test
    if (typeof window !== 'undefined') {
        factory(global);
    }
    else {
        console.error('Modulo requires to be loaded in a browser window.');
    }
})(this, function(global) {
    'use strict';
    
    var parcels = [];
    var updated_parcels = [];

    function Parcel(name, type) {
        type = type || 'module';
        name = name.replace(/^\//, '');
        if (type === 'module') {
            if (!(/.js$/.test(name))) {
                name += '.js';
            }
        }
        this.name = name;
        this.type = type;
        this.loaded = false;
        this.dependencies = [];
    }
    Parcel.fn = Parcel.prototype;
    Parcel.fn.load = function() {
        var parcel = this;
        var oss = parcel.oss;
        parcels.push(parcel);
        return new Promise(function(resolve, reject) {
            var reference = parcel.name;
            
            if (Modulo.mode === 'live') {
                loadLive(parcel).then(function() {
                    resolve();
                }).catch(function() {
                    reject();
                });
            }
            else {
                if (oss instanceof OSS) {
                    oss.parcels.get(reference).then(function(result) {
                        if (result === 404) {
                            loadLive(parcel, true).then(function() {
                                resolve();
                            }).catch(function() {
                                reject();
                            });
                        }
                        else {
                            parcel.source = result.object.source;
                            if (parcel.type === 'module') {
                                parcel.dependencies = crawl_module(parcel);
                                if (parcel.dependencies.length > 0) {
                                    parcel.dependencies.load().then(function() {
                                        parcel.loaded = true;
                                        resolve(parcel.exec);
                                    });
                                }
                                else {
                                    parcel.loaded = true;
                                    resolve(parcel.exec);
                                }
                            }
                        }
                    });
                }
            }
        });
    };
    Parcel.fn.cache = function(stamp) {
        var parcel = this;
        var source = parcel.source;
        var reference = parcel.name;
        var oss = parcel.oss;
        oss.parcels.get(reference).then(function(result) {
            getChecksum(source).then(function(checksum) {
                var object = {
                    reference: reference,
                    source: source,
                    stamp: stamp,
                    checksum: checksum
                };
                if (result === 404) {
                    oss.parcels.store(object);
                }
                else {
                    oss.parcels.update(object, result.key);
                }
            });
        });
    };
    Parcel.fn.update = function() {
        var parcel = this;
        return new Promise(function(resolve, reject) {
            var reference = parcel.name;
            var oss = parcel.oss;
            if (oss instanceof OSS) {
                oss.parcels.get(reference).then(function(result) {
                    if (typeof result === 'object') {
                        var object = result.object;
                        var xhr = new XMLHttpRequest();
                        xhr.open('GET', reference);
                        xhr.setRequestHeader('Cache-Control', 'no-cache');
                        xhr.onload = function() {
                            if (xhr.status === 200) {
                                var source = xhr.response;
                                var stamp = xhr.getResponseHeader('Last-Modified');
                                getChecksum(source).then(function(checksum) {
                                    if (checksum !== object.checksum || stamp !== object.stamp) {
                                        object.source = source;
                                        object.stamp = stamp;
                                        object.checksum = checksum;
                                        oss.parcels.update(reference, object).then(function() {
                                            parcel.updated = true;
                                            resolve(parcel);
                                        });
                                    }
                                    else {
                                        parcel.updated = true;
                                        resolve();
                                    }
                                });
                            }
                            else {
                                parcel.updated = true;
                                console.error('Failed to update parcel.');
                                resolve();
                            }
                        }
                        xhr.send();
                    }
                    else {
                        parcel.updated = true;
                        resolve();
                    }
                }).catch(function() {
                    reject();
                });
            }
            else {
                reject();
            }
        });
    };

    function loadLive(parcel, cache) {
        return new Promise(function(resolve, reject) {
            var reference = parcel.name;
            var xhr = new XMLHttpRequest;
            xhr.open('GET', reference);
            if (cache !== 'default') {
                xhr.setRequestHeader('Cache-Control', 'no-cache');
            }
            xhr.onload = function() {
                if (xhr.status === 200) {
                    var stamp = xhr.getResponseHeader('Last-Modified');
                    parcel.source = xhr.response;
                    if (parcel.type === 'module') {
                        parcel.dependencies = crawl_module(parcel);
                        if (parcel.dependencies.length > 0) {
                            parcel.dependencies.load().then(function() {
                                parcel.loaded = true;
                                if (cache) {
                                    parcel.cache(stamp);
                                }
                                resolve({
                                    source: parcel.source,
                                    exec: parcel.exec,
                                    stamp: stamp
                                });
                            });
                        }
                        else {
                            parcel.loaded = true;
                            if (cache) {
                                parcel.cache(stamp);
                            }
                            resolve({
                                source: parcel.source,
                                exec: parcel.exec,
                                stamp: stamp
                            });
                        }
                    }
                }
                else {
                    console.error('Failed to retrieve ' + reference);
                    reject(xhr.status);
                }
            };
            xhr.onerror = function() {
                console.error('Failed to retrieve ' + reference);
                reject();
            }
            xhr.send();
        });
    }

    function Module(name, oss) {
        Parcel.call(this, name, 'module');
        this.oss = oss;
    }
    Module.fn = Module.prototype = Parcel.prototype;
    Module.fn.mount = function(exports) {
        var parcel = this;
        if (parcel.loaded) {
            if (typeof exports === 'undefined') exports = [];
            if (exports instanceof Array) {
                var defs = '';
                for (var i = 0; i < exports.length; i++) {
                    for (var key in exports[i]) {
                        if (exports[i].hasOwnProperty(key)) {
                            var value = exports[i][key];
                            if (typeof value === 'string') {
                                defs += key + " = '" + value + "';";
                            }
                            else {
                                defs += key + ' = ' + value + ';';
                            }
                        }
                    }
                }
                parcel.exec = defs + parcel.exec;
            }
            return Function(parcel.exec).apply(global);
        }
    };

    function crawl_module(module) {
        var dependencies = new Bundle();
        if (module instanceof Module) {
            var source = module.source;
            var basepath = module.name.substring(0, module.name.lastIndexOf('/') + 1);
            if (typeof source === 'string') {
                var imports = source.match(/\s*((\/{2,})*|(\/\*)*)\s*use\s*\(\s*'.+?'\s*\)\s*;\s*(\*\/)*/g);
                if (imports !== null) {
                    for (var i = 0; i < imports.length; i++) {
                        source = source.replace(imports[i], '');
                        if (imports[i].match(/\s*((\/{2,})|(\/\*))\s*use/) === null) {
                            var reference = imports[i].match(/use\s*\(\s*'.+?'\s*\)/)[0];
                            reference = reference.replace(/use|[()';*]/g, '').trim();
                            if (/^\.\//.test(reference)) {
                                reference = reference.replace(/^\.\//, basepath);
                            }
                            else {
                                if (typeof Modulo.basepath === 'string') {
                                    Modulo.basepath = Modulo.basepath.replace(/\/$/, '');
                                    reference = reference.replace(/^\//, '');
                                    reference = Modulo.basepath + '/' + reference;
                                }
                            }
                            dependencies.push(new Module(reference, module.oss));
                        }
                    }
                }
                module.exec = source;
            }
        }
        return dependencies;
    }

    function getChecksum(source) {
        return new Promise(function(resolve, reject) {
            if (typeof source === 'string') {
                var checksum = 0;
                for (var i = 0; i < source.length; i++) {
                    var n = source.charCodeAt(i);
                    checksum += n;
                }
                resolve(checksum);
            }
        });
    }

    function Bundle(parcels, type) {
        type = type || 'module';
        this.type = type;
        if (typeof parcels === 'string') {
            parcels = [parcels];
        }
        if (parcels instanceof Array) {
            for (var i = 0; i < parcels.length; i++) {
                if (type === 'module') {
                    this.push(new Module(parcels[i], this.oss));
                }
            }
        }
    }
    Bundle.fn = Bundle.prototype = Array.prototype;
    Bundle.fn.load = function() {
        var bundle = this;
        return new Promise(function(resolve, reject) {
            if (bundle.length === 0) {
                resolve(bundle);
            }
            else {
                for (var i = 0; i < bundle.length; i++) {
                    var parcel = bundle[i];
                    parcel.load().then(function() {
                        if (bundle.isLoaded()) {
                            resolve(bundle);
                        }
                    });
                }
            }
        });
    };
    Bundle.fn.isLoaded = function() {
        var bundle = this;
        for (var i = 0; i < bundle.length; i++) {
            if (!bundle[i].loaded) return false;
        }
        return true;
    };
    Bundle.fn.mount = function() {
        var bundle = this;
        var exports = [];
        var defs;
        for (var i = 0; i < bundle.length; i++) {
            var parcel = bundle[i];
            if (parcel instanceof Module) {
                if (parcel.dependencies.length > 0) {
                    defs = parcel.dependencies.mount();
                }
                var obj = parcel.mount(defs);
                exports.push(obj);
            }
        }
        return exports;
    };

    function OSS(name, version) {
        this.name = name;
        this.version = version || 1;
        this.stores = [];
        this.addStore('parcels');
        this.mode = 'local';
    }
    OSS.fn = OSS.prototype;
    OSS.fn.open = function() {
        var oss = this;
        return new Promise(function(resolve, reject) {
            var request = indexedDB.open(oss.name, oss.version);
            request.onupgradeneeded = function(ev) {
                var db = ev.target.result;
                if (oss.stores.length > 0) {
                    for (var i = 0; i < oss.stores.length; i++) {
                        var store = db.createObjectStore(oss.stores[i], {autoIncrement: true});
                        if (!store.indexNames.contains('reference')) {
                            store.createIndex('reference', 'reference');
                        }
                    }
                }
            };
            request.onsuccess = function(ev) {
                var db = ev.target.result;
                resolve(db);
            };
            request.onerror = function(ev) {
                reject(ev);
            };
        });
    };
    OSS.fn.delete = function() {
        var oss = this;
        return new Promise(function(resolve, reject) {
            var request = indexedDB.deleteDatabase(oss.name);
            request.onsuccess = function() {
                resolve();  
            };
            request.onerror = function(ev) {
                console.error('Failed to delete OSS. An error occurred.');
                reject(ev);
            };
            request.onblocked = function(ev) {
                console.error('Failed to delete OSS. OSS is blocked.');
                reject(ev)
            };
        });
    };
    OSS.fn.addStore = function(name) {
        var oss = this;
        if (typeof name === 'string') {
            name = name.trim();
            if (name) {
                oss.stores.push(name);
                if (!oss.hasOwnProperty(name)) {
                    Object.defineProperties(oss, {
                        [name]: {
                            get: function() {
                                return new Store(name, oss);
                            }
                        }
                    });
                }
            }
        }
    };

    function Store(name, oss) {
        if (typeof name === 'string') {
            name = name.trim();
            this.name = name;
        }
        if (oss instanceof OSS) {
            this.oss = oss;
        }
    }
    Store.fn = Store.prototype;
    Store.fn.store = function(data) {
        var store = this;
        var oss = store.oss;
        return new Promise(function(resolve, reject) {
            if (oss instanceof OSS) {
                oss.open().then(function(db) {
                    var transaction = db.transaction([store.name], 'readwrite');
                    var ostore = transaction.objectStore(store.name);
                    var request = ostore.add(data);
                    request.onsuccess = function() {
                        db.close();
                        resolve();
                    };
                    request.onerror = function(ev) {
                        db.close();
                        console.error('Failed to store object into the OSS.');
                        reject(ev);
                    };
                }).catch(function() {
                    console.error('Failed to open OSS.');
                    reject();
                });
            }
            else {
                console.error('No OSS defined for the ' + store.name + ' store.');
                reject();
            }
        });
    };
    Store.fn.update = function(reference, data) {
        var store = this;
        var oss = store.oss;
        return new Promise(function(resolve, reject) {
            if (oss instanceof OSS) {
                store.get(reference).then(function(object) {
                    if (object !== 404 && typeof object === 'object') {
                        var key = object.key;
                        oss.open().then(function(db) {
                            var transaction = db.transaction([store.name], 'readwrite');
                            var ostore = transaction.objectStore(store.name);
                            var request = ostore.put(data, key);
                            request.onsuccess = function() {
                                db.close();
                                resolve();
                            };
                            request.onerror = function(ev) {
                                db.close();
                                console.error('Failed to update object in the OSS.');
                                reject(ev);
                            };
                        }).catch(function() {
                            console.error('Failed to open OSS.');
                            reject();
                        });
                    }
                    else {
                        resolve();
                    }
                }).catch(function() {
                    reject();
                });
            }
            else {
                console.error('No OSS defined for the ' + store.name + ' store.');
                reject();
            }
        });
    };
    Store.fn.get = function(reference) {
        var store = this;
        var oss = store.oss;
        return new Promise(function(resolve, reject) {
            if (oss instanceof OSS) {
                oss.open().then(function(db) {
                    var transaction = db.transaction([store.name], 'readwrite');
                    var ostore = transaction.objectStore(store.name);
                    var get_key_request = ostore.index('reference').getKey(reference);
                    get_key_request.onsuccess = function(ev) {
                        var key = ev.target.result;
                        if (typeof key !== 'undefined') {
                            var get_object_request = ostore.index('reference').get(reference);
                            get_object_request.onsuccess = function(ev) {
                                var obj = ev.target.result;
                                db.close();
                                resolve({
                                    object: obj,
                                    key: key
                                });
                            };
                            get_object_request.onerror = function() {
                                db.close();
                                console.error('Failed to retrieve object from the OSS.');
                                reject();
                            };
                        }
                        else {
                            db.close();
                            resolve(404);
                        }
                    };
                    get_key_request.onerror = function(ev) {
                        db.close();
                        console.error('Failed to retrieved object key from the OSS.');
                        reject(ev);
                    };

                }).catch(function() {
                    console.error('Failed to open OSS.');
                    reject();
                });
            }
            else {
                console.error('No OSS defined for the ' +  store.name + ' store.');
                reject();
            }
        });
    };

    function Modulo(parcels, type) {
        type = type || 'module';
        if (!(this instanceof Modulo)) return new Modulo(parcels, type);
        if (typeof Modulo.oss === 'string') {
            Modulo.oss = Modulo.oss.trim();
            this.oss = new OSS(Modulo.oss);
        }
        Bundle.call(this, parcels, type);
    }
    Modulo.fn = Modulo.prototype = Bundle.prototype;
    Modulo.update = function() {
        return new Promise(function(resolve, reject) {
            if (parcels instanceof Array) {
                if (parcels.length > 0) {
                    var i = 0;
                    var parcel;
                    updated_parcels = [];
                    for (i = 0; i < parcels.length; i++) {
                        parcel = parcels[i];
                        parcel.updated = false;
                    }
                    for (i = 0; i < parcels.length; i++) {
                        parcel = parcels[i];
                        parcel.update().then(function(p) {
                            if (typeof p !== 'undefined') updated_parcels.push(p);
                            var complete = true;
                            for (var j = 0; j < parcels.length; j++) {
                                if (!parcels[j].updated) {
                                    complete = false;
                                    break;
                                }
                            }
                            if (complete) resolve(updated_parcels);
                        });
                    }
                }
                else {
                    resolve(updated_parcels);
                }
            }
            else {
                resolve(updated_parcels);
            }
        });
    };
    Modulo.getUpdates = function() {
        return updated_parcels;
    };

    function mount(parcels) {
        return new Promise(function(resolve, reject) {
            Modulo(parcels).load().then(function(bundle) {
                var exports = bundle.mount();
                resolve(exports);
            });
        });
    }

    global['OSS'] = OSS;
    global['Modulo'] = Modulo;
    global['mount'] = mount;
});