var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var ledsRouter = require('./routes/leds');
var usersRouter = require('./routes/users');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/api', indexRouter);
app.use('/api/leds', ledsRouter);
app.use('/api/users', usersRouter);

// serve the UI
app.use(express.static(path.resolve(__dirname, './ui/build')));
app.get('*', (_, res) => {
  res.sendFile(path.resolve(__dirname, './ui/build', 'index.html'));
});

module.exports = app;