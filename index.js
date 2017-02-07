var Twit = require('twit');
var util = require('util');
var EventEmitter = require('events');
var fs = require("fs");
var path = require("path");
var request = require('request');

var TweetCollector = function(twitterCredentials, settings) {
  EventEmitter.call(this);
  if (!settings)
    settings = {};
  this.twit = new Twit(twitterCredentials);
  this.search_params = settings.search_params;
  this.search_params.screen_name = settings.search_params.screen_name;
  this.search_params.count = settings.batch_size || 100; // Max 100
  this.interval_id = null;
  this.search_interval = settings.interval * 1000 || 10000;
  this.pending_request = false;
  this.last_tweet_id = null;
  this.status = 'stopped';
};

util.inherits(TweetCollector, EventEmitter);

TweetCollector.prototype.fetchTweets = function() {
  var self = this;

  console.log('TweetCollector is searching for tweets...('+self.search_params.screen_name+')'+(new Date()).toISOString());

  if (self.pending_request) return;
  self.pending_request = true;

  self.twit.get('favorites/list', self.search_params, function(err, data) {
    if (err) {
      console.log('TweetCollector failed to fetch tweets')
      return console.error(err);
    }

    console.log('TweetCollector found ' + data.length + ' tweets for '+self.search_params.screen_name);

    if (data && data.length > 0) {
      self.last_tweet_id = data[data.length - 1].id_str;
      self.emit('fetch', data);
    }

    self.pending_request = false;
  });
};

TweetCollector.prototype.start = function() {
  console.log("Start timer with "+this.search_interval/1000+" seconds. User: "+this.search_params.screen_name);
  this.interval_id = setInterval(this.fetchTweets.bind(this), this.search_interval);
  this.fetchTweets();
  this.status = 'started';

  process.on('exit', this.stop);
};

TweetCollector.prototype.stop = function() {
  clearInterval(this.interval_id);
  this.status = 'stopped';

  console.log('TweetCollector stopped.');
};

module.exports = TweetCollector;



var config = require("config");

var twitterCredentials = config.get("twitter");
var twitterUsers = config.get("TwitterUser");




Object.keys(twitterUsers).forEach(function(twitterUser){

  var dataFile = path.join(__dirname,twitterUser+".json");


  var tweetCollector = new TweetCollector(twitterCredentials, {
    batch_size: 20,
    interval: 120, // seconds
    search_params: {screen_name:twitterUser}
  });
  tweetCollector.start();
  tweetCollector.on('fetch', function(tweetsArray) {
    if (!fs.existsSync(dataFile)){
      // if no tweet is read, put it to the existing tweets and go on
      let json = {};
      tweetsArray.forEach(function(tweet){
        json[tweet.id_str]="Initialised";
      });
      fs.writeFileSync(dataFile,JSON.stringify(json),"utf8");
      return;
    }
    tweetsArray.forEach(function(tweet){
      let time=new Date();
      let json = JSON.parse(fs.readFileSync(dataFile,"utf8"));
      if (!json[tweet.id_str]) {
       // console.log(tweet.user.name+" tweeted:");
       // console.log(">        >"+tweet.text);
        request.post("http://localhost:3000/osmbc/api/collectArticle/DevelopmentApiKeyTBC",
          {form:{OSMUser:twitterUsers[twitterUser],collection:"https://twitter.com/"+twitterUser+"/status/"+tweet.id_str}},
            function(err, data){
              if (err) {
                console.log(err);
                json[tweet.id_str]=err;
              }else {
                json[tweet.id_str]=data.body;
              }
              fs.writeFileSync(dataFile,JSON.stringify(json,null," "),"utf8");
            }
           );
      }
    });
  });

});
