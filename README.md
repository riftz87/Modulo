# Modulo
A Javascript module loader with caching support and easy source update mechanism intended for areas with slow internet connections.   
Modulo works by loading and caching the modules during the first load then using the cached modules for the succeeding load improving and giving consistent speed especially in areas with slow internet connections.
# Usage
Set the name of the OSS (Offline Solution Storage) used for caching the modules. This must be unique for every web application and must be initialized before calling mount or load.
```javascript
Modulo.oss = 'demo';
mount('module1').then(function() {
  // Codes to execute after the modules has been loaded and mounted
});
```
Loading single module:
```javascript
Modulo('module1').load().then(function() {
  // Codes to execute after the modules has been loaded and mounted  
});
```
Or
```javascript
mount('module1').then(function() {
  // Codes to execute after the modules has been loaded and mounted  
});
```
Loading multiple modules:
```javascript
Modulo(['module1', 'module2']).load().then(function() {
  // Codes to execute after the modules has been loaded and mounted  
});
```
Or
```javascript
mount(['module1', 'module2']).then(function() {
  // Codes to execute after the modules has been loaded and mounted  
});
```
To update modules in the oss:
```javascript
mount(['module1', 'module2']).then(function() {
  Modulo.update().then(function(updates) {
    // Code to execute after modules has been updated
    // updates is an array that contains the modules that has been updated
    updates.forEach(function(parcel) {
      console.log(parcel.name + ' has been updated.');
    });
  });
});
```
Modulo is by default set to load and cache modules. To load modules live (directly from your server), you can set the mode property of Modulo to 'live' before any call to mount or load. This is particularly helpful during development mode.
```javascript
Modulo.mode = 'live';
mount(['module1', 'module2']).then(function() {
  // Codes to execute after the modules has been loaded and mounted
}
```
Inside the module you can specify dependencies by using the 'use' keyword:
```javascript
use('submodule1');
use('submodule2');
console.log('Module has been loaded');
```
Modules can export an object that the dependent module can use:  
submodule1.js
```javascript
console.log('submodule1 has been loaded.');
return {
  text: 'Hello World',
  num: 16,
  fn: function() {
    console.log('This is from submodule1');
  }
}
```
module1.js
```javascript
use('submodule1');
console.log(text);
console.log(num);
fn();
```
To load modules relative to the parent module prepend './' to the module name:
```javascript
use('./modules/submodule1');
console.log('Module has been loaded.');
```

Note: Module name can either have .js extension or no extension.
# Donations
If this helps you in your projects and think is worth paying for, I am gladly accepting kind donations. Thank you.
[![paypal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/donate?hosted_button_id=UW2BMEKKV27CL)
