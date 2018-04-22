var express = require('express');
var router = express.Router();
var mongoose = require("mongoose");
var passcrypt = require('password-hash-and-salt');
var jwt = require('jsonwebtoken');
var dotenv = require('dotenv').config();
var analytics = require('universal-analytics'); 

var visitor = analytics('UA-18006016-8');

mongoose.Promise = global.Promise;
mongoose.connect("mongodb://catalyse:password123@ds231199.mlab.com:31199/hw4");

var userSchema = new mongoose.Schema({
  username: String,
  name: String,
  password: String
});

var movieSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    index: {unique: true}
  },
  releaseyear: {
    type: Number,
    required: true,
    index: {unique: false}
  },
  genre: {
    type: String,
    required: true,
    enum: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Thriller', 'Western']
  },
  actors: {
    type: [{actorname: {
      type: String,
      required: true
    }, 
    charactername: {
      type: String,
      required: true
    }}],
    required: true,
    validate: {
      validator: function(v) {
        return v.length >= 3;
      },
      message: 'You must have at least 3 actors!'
    }
  }
});

var reviewSchema = new mongoose.Schema({
  movie: String,
  review: String
});

var user = mongoose.model('user', userSchema);
var movie = mongoose.model('movie', movieSchema);
var review = mongoose.model('review', reviewSchema);

router.post('/login', function(req,res) {
  user.find({'username': req.body.username}, function(err, user) {
    if(err) res.send(err);
    else {
      if(user.length > 0) {
        ValidatePass(req.body.password, user[0].password, function(result) {
          if(result) {
            visitor.event("Login", "Success").send();
            var userToken = {name: user[0].name, username: user[0].username};
            var token = jwt.sign(userToken, process.env.SECRET_KEY);
            res.json({success: true, token: token});
          }
          else {
            visitor.event("Login", "Failure").send();
            res.send("Invalid Password");
          }
        });
      }
      else {
        res.send("User not found");
      }
    }
  });
});

router.post('/register', function(req,res) {
  user.find({'username': req.body.username}, function(err, users) {
    if(err) res.send(err);
    else {
      if(users.length > 0) {
        res.send("A user with the username already exists!");
      }
      else {
        passcrypt(req.body.password).hash(function(error, hash) {
          if(error) {
            res.send("There was an error hashing the password!");
          }//TODO: Split salt off hash and store in separate table.
          else {
            var newUser = new user({
              username: req.body.username,
              name: req.body.name,
              password: hash
            });
            newUser.save(function(err, data) {
              if(err) {
                visitor.event("Register", "Failure").send();
                res.send("There was an error registering the user!");
              }
              else {
                visitor.event("Register", "Success").send();
                res.send("Registration Successful!");
              }
            });
          }
        });
      }
    }
  });
});

//All movies are indexed by title since the title is unique.

router.get('/movies/all', function(req, res) {//get all movies
  CheckToken(req.headers.jwt, function(result) {
    if(result) {
      movie.find(function(err, movies) {
        if(err) res.send("Error finding movies");
        else {
          visitor.event("Movies", "Get All Movies").send();
          if(movies.length > 0)
            res.send(movies);
          else 
            res.send("No movies found");
        }
      });
    }
    else {
      res.status(401).send("Unauthorized to make this request");
    }
  });
});

router.get('/movies/all/reviews', function(req, res) {//get all movies
  //CheckToken(req.headers.jwt, function(result) {
    //if(result) {
      movie.find(function(err, movies) {
        if(err) res.send("Error finding movie - Likely an invalid ID - ERR: " + err);
        else {
          if(movies.length > 0) {
            var returnObj = [];
            GetMoviesReviews(req, res, req.params.id, function(result) {
              if(result.length > 0) {
                for(j = 0; j < movies.length; j++) {
                  returnObj[j] = new Object();
                  returnObj[j].actors = movies[j].actors;
                  returnObj[j]._id = movies[j].id;
                  returnObj[j].genre = movies[j].genre;
                  returnObj[j].releaseyear = movies[j].releaseyear;
                  returnObj[j].title = movies[j].title;
                  returnObj[j].reviews = [];
                  var foundreviews = false;
                  for(i = 0; i < result.length; i++) {
                    if(result[i].movie == movies[j].id) {
                      returnObj[j].reviews.push(result[i]);
                      foundreviews = true;
                    }
                  }
                  if(!foundreviews) {
                    returnObj[j].reviews.push("No reviews found for this movie!");
                  }
                }
                res.send(returnObj);
              }
              else {
                res.send("No Movies Found!");
              }
            });
          }
          else 
            res.send("No movie found");
        }
      });
    //}
    //else {
    //  res.status(401).send("Unauthorized to make this request");
    //}
  //});
});

router.get('/movies/:id', function(req,res) {//get a movie
  CheckToken(req.headers.jwt, function(result) {
    if(result) {
      movie.findById(req.params.id, function(err, movie) {
        if(err) res.send("Error finding movie - Likely an invalid ID - ERR: " + err);
        else {
          visitor.event("Movies", "Get Movie By ID").send();
          visitor.pageview("Movie", req.params.id).send();
          if(movie)
            res.send(movie);
          else 
            res.send("No movie found");
        }
      });      
    }
    else {
      res.status(401).send("Unauthorized to make this request");
    }
  });
});

router.get('/movies/:id/:getreviews', function(req,res) {//get a movie
  CheckToken(req.headers.jwt, function(result) {
    if(result) {
      if(req.params.getreviews == 'true') {
        movie.findById(req.params.id, function(err, movie) {
          if(err) res.send("Error finding movie - Likely an invalid ID - ERR: " + err);
          else {
            if(movie) {
              visitor.event("Movies", "Get Movie by ID with review").send();
              visitor.pageview("Movie", req.params.id).send();
              GetMovieReviews(req, res, req.params.id, function(result) {
                if(result.length > 0) {
                  var returnObj = new Object();
                  returnObj.movie = movie;
                  returnObj.reviews = result;
                  res.send(returnObj);
                }
                else {
                  var returnObj = new Object();
                  returnObj.movie = movie;
                  returnObj.reviews = "No Reviews Found for this Movie!";
                  res.send(returnObj);
                }
              });
            }
            else 
              res.send("No movie found");
          }
        });
      }
      else {
        movie.findById(req.params.id, function(err, movie) {
          if(err) res.send("Error finding movie - Likely an invalid ID - ERR: " + err);
          else {
            visitor.event("Movies", "Get Movie by ID").send();
            visitor.pageview("Movie", req.params.id).send();
            if(movie)
              res.send(movie);
            else 
              res.send("No movie found");
          }
        });
      }     
    }
    else {
      res.status(401).send("Unauthorized to make this request");
    }
  });
});

router.post('/movies', function(req,res) {//Add movies
  CheckToken(req.headers.jwt, function(result) {
    if(result) {      
      var newMovie = new movie({
        title: req.body.title,
        releaseyear: req.body.releaseyear,
        genre: req.body.genre,
        actors: req.body.actors
      });
      newMovie.save(function(err, data){
        if(err) {
          if(err.code == '11000'){
            res.send("A movie with this title already exists!");
          }
          else {
            res.send(err);
          }
        }
        else {
          res.send("Save Success");
          visitor.event("Movies", "Added a Movie").send();
        }
      });
    }
    else {
      res.status(401).send("Unauthorized to make this request");
    }
  });
});

router.put('/movies/:id', function(req,res) {//Delete Movies
  CheckToken(req.headers.jwt, function(result) {
    if(result) {
      movie.findById(req.params.id, function(err, movie) {
        if(err) res.send("Error finding movie - Likely an invalid ID - ERR: " + err);
        else {
          if(movie) {
            if(req.body.title) {
              movie.title = req.body.title;
            }
            if(req.body.releaseyear) {
              movie.releaseyear = req.body.releaseyear;
            }
            if(req.body.genre) {
              movie.genre = req.body.genre;
            }
            if(req.body.actors) {
              movie.actors = req.body.actors;
            }
            movie.save(function(error) {
              if(err) {
                res.send(error);
              }
              else {
                visitor.event("Movies", "Edited a Movie").send();
                visitor.pageview("Movie", req.params.id).send();
                res.send("Update Success!");
              }
            });
          }
          else 
            res.send("No movie found");
        }
      });      
    }
    else {
      res.status(401).send("Unauthorized to make this request");
    }
  });
});

router.delete('/movies/:id', function(req,res) {
  CheckToken(req.headers.jwt, function(result) {
    if(result) {
      movie.findByIdAndRemove(req.params.id, function(err) {
        if(err) res.send("Error finding movie - Likely an invalid ID - ERR: " + err);
        else {
          visitor.event("Movies", "Deleted a Movie").send();
          res.send("Movie Deleted!");
        }
      });      
    }
    else {
      res.status(401).send("Unauthorized to make this request");
    }
  });
});

//Get review by review ID
router.get('/review/:id', function(req, res) {
  CheckToken(req.headers.jwt, function(result) {
    if(result) {
      review.findById(req.params.id, function(err, review) {
        if(err) res.send("Error finding review - Likely an invalid ID - ERR: " + err);
        else {
          if(review) {
            visitor.event("Reviews", "Viewed a Review").send();
            visitor.pageview("Review", req.params.id).send();
            res.send(review);
          }
          else 
            res.send("No review found");
        }
      });      
    }
    else {
      res.status(401).send("Unauthorized to make this request");
    }
  });
});

//Get reviews by movie
router.get('/movie/reviews/:id', function(req, res) {
  CheckToken(req.headers.jwt, function(result) {
    if(result) {
      GetMovieReviews(req, res, req.params.id, function(result) {
        visitor.event("Reviews", "Got reviews for a movie").send();
        res.send(result);
      });
    }
    else {
      res.status(401).send("Unauthorized to make this request");
    }
  });
});

function GetMovieReviews(req, res, id, finishFunction) {
  review.find(function(err, reviews) {
    if(err) finishFunction("Error finding reviews");
    else {
      if(reviews.length > 0) {
        var returnList = [];
        for(i = 0; i < reviews.length; i++) {
          if(reviews[i].movie == id) {
            returnList.push(reviews[i]);
          }
        }
        if(returnList.length > 0) {
          finishFunction(returnList);
        }
        else {
          finishFunction("No reviews found for this movie"); 
        }
      }            
      else 
      finishFunction("No reviews found");
    }
  });
}

function GetMoviesReviews(req, res, id, finishFunction) {
  review.find(function(err, reviews) {
    if(err) finishFunction("Error finding reviews");
    else {
      if(reviews.length > 0) {
        finishFunction(reviews);
      }            
      else 
      finishFunction("No reviews found");
    }
  });
}

router.post('/review', function(req, res) {
  CheckToken(req.headers.jwt, function(result) {
    if(result) {      
      movie.findById(req.body.id, function(err, movie) {
        if(err) res.send("Error finding movie - Likely an invalid ID - ERR: " + err);
        else {
          if(movie){
            var newReview = new review({
              movie: req.body.id,
              review: req.body.review
            });
            newReview.save(function(err, data){
              if(err) {
                res.send(err);
              }
              else {
                visitor.event("Reviews", "Added a Review").send();
                res.send("Save Success");
              }
            });
          }
          else  {
            res.send("No movie found to assign this review to!");
          }
        }
      }); 
    }
    else {
      res.status(401).send("Unauthorized to make this request");
    }
  });

});

router.put('/review/:id', function(req, res) {
  CheckToken(req.headers.jwt, function(result) {
    if(result) {
      review.findById(req.params.id, function(err, review) {
        if(err) res.send("Error finding review - Likely an invalid ID - ERR: " + err);
        else {
          if(review) {
            if(req.body.review) {
              review.review = req.body.review;
            }
            review.save(function(error) {
              if(err) {
                res.send(error);
              }
              else {
                visitor.event("Reviews", "Edited a Review").send();
                visitor.pageview("Review", req.params.id).send();
                res.send("Update Success!");
              }
            });
          }
          else 
            res.send("No review found");
        }
      });      
    }
    else {
      res.status(401).send("Unauthorized to make this request");
    }
  });
});

router.delete('/review/:id', function(req, res) {
  CheckToken(req.headers.jwt, function(result) {
    if(result) {
      review.findByIdAndRemove(req.params.id, function(err) {
        if(err) res.send("Error finding review - Likely an invalid ID - ERR: " + err);
        else {
          visitor.event("Reviews", "Deleted a Review").send();
          res.send("Review Deleted!");
        }
      });      
    }
    else {
      res.status(401).send("Unauthorized to make this request");
    }
  });
});

router.use('*', function(req, res) {
  res.send('Invalid Request or Type');
});

//This function will take the password and validate it against the existing hash
function ValidatePass(pass, hash, finish) {
  passcrypt(pass).verifyAgainst(hash, function(error, verified) {
    if(error) {
      finish(false);
    }
    if(!verified) {
      finish(false);
    }
    else {
      finish(true);
    }
  })
};

function CheckToken(token, finish) {
  if(token != undefined && token != null) {
    var token = jwt.verify(token, process.env.SECRET_KEY);
    user.find({'username': token.username}, function(err, user) {
      if(err) res.send(err);
      else {
        if(user.length > 0) {
          finish(true);
        }
        else {
          finish(false);
        }
      }
    });
  }
  else {
    finish(false);
  }
}

module.exports = router;
