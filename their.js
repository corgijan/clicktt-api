var lsDebugMode = tr;
var updateOfTotalBallsAndSetsInProgress = false;
var protocollForAjaxCalls = "GET";

(function(ko, $, _) {
    // namespace
    window.Livescoring = {};

    improveTimesForTestingParamExists = findGetParameter("improveTimesForTesting");
    improveTimesForTesting = typeof improveTimesForTestingParamExists !== 'undefined' && improveTimesForTestingParamExists != null;

    // number of sets in a match
    Livescoring.SETS = 5;
    Livescoring.times = {
        setChange: improveTimesForTesting ? 200 : 700,
        matchChange: improveTimesForTesting ? 200 : 1000,
        totalChange: improveTimesForTesting ? 200 : 1000,
        reloadScoredEveryEditMode: improveTimesForTesting ? 999999 : 40000,
        reloadScoredEveryViewOnlyMode: improveTimesForTesting ? 999999 : 45000,
        enableWriteModeAfterLoadingLastScore: improveTimesForTesting ? 2500 : 1500
    };

    /*
        ViewModel: Livescoring.Party

        a Party is one player in singles and two player in doubles from one team in one match.
        Doubles have the names DA1-DB2 or DA3-DB3 and singles have the sames A6-B5 or something like that
    */
    Livescoring.Party = function(name, players, properties) {
        var that = this;

        that.name = name;
        that.players = ko.observableArray(players);

        ko.utils.objectForEach(properties, function(key, value) {
            that[key] = ko.observable(value);
        });

        that.formattedName = ko.pureComputed(function() {
            var ret = [];

            var lastPlayer = that.players.length >= 2 ? that.players()[0] : [];
            ko.utils.arrayForEach(ko.unwrap(that.players), function(player) {
                nameToAppend =
                    lastPlayer === player
                        ? "nicht angetreten"
                        : ko.unwrap(player.name);
                ret.push(nameToAppend);
                lastPlayer = player;
            });

            return ret.join(" / ");
        });

        that.isDouble = ko.pureComputed(function() {
            return Livescoring.Party.isDoubleName(ko.unwrap(that.name));
        });
    };

    Livescoring.Party.createPlayerDummies = function(partyName) {
        if (Livescoring.Party.isDoubleName(partyName)) {
            return [
                new Livescoring.Player({
                    name: "Doppel " + partyName.substr(2, 1) + " Spieler"
                }),
                new Livescoring.Player({
                    name: "Doppel " + partyName.substr(2, 1) + " Spieler"
                })
            ];
        } else {
            return [new Livescoring.Player({ name: "Spieler " + partyName })];
        }
    };

    Livescoring.Party.isDoubleName = function(name) {
        return name.substr(0, 1) === "D";
    };

    /*
        ViewModel: Livescoring.Player
    */
    Livescoring.Player = function(properties) {
        var that = this;

        ko.utils.objectForEach(properties, function(key, value) {
            that[key] = ko.observable(value);
        });

        that.name = ko.pureComputed(function() {
            if (properties.name) return properties.name;

            return properties.lastname + ", " + properties.firstname;
        });

        that.id = ko.pureComputed(function() {
            return ko.unwrap(that.personId);
        });

        that.position = ko.pureComputed(function() {
            return that.teamNr() + "." + that.rank();
        });
    };

    /*
        ViewModel: Livescoring.Match

        A match consists of 5 Livescoring.Sets, 2 Livescoring.Party, 1 Livescoring.MatchScore 1 meeting, where it is played

        - properties: (will be copied to the object)
            .name: the name of the match like A2-B2 or DA1-DB2
            .number: starts by one and is consecutive numbered in the order of the grid,
            .spec: the part of the grid, that specifies that match .e.g. ["A2", "B2],
            .partyA: defines the party for spec[0],
            .partyB: defines the party for spec[1]


        - data: (will only be processed)

             .scores:
                 .sets: array of setScores. Each setScore is an array with the points for A and points for B. The order is important

             example for data:
             {
                 .scores: {
                         sets: [
                            [0,11],
                            [0,11],
                            [11,1],
                            [11,0],
                            [10:12]
                        ]
                 }
             }

        - meeting: Livescoring.Meeting
    */
    Livescoring.Match = function(properties, data, meeting) {
        var that = this;

        that.meeting = meeting;

        // editMode for the sets
        that.editMode = ko.observable(false);

        // the matchScore is only the set result (like 3:2 or 3:0) - given indepently from the detailed points
        that.matchScore = new Livescoring.MatchScore(that);

        // cumulated score for alle matches in total, for this current match
        that.totalPoints = ko.observable("");

        ko.utils.objectForEach(properties, function(key, value) {
            that[key] = ko.observable(value);
        });

        // process the inputs
        that.fillSets = function(properties, data) {
            var sets = {};

            if (data.scores && data.scores.sets) {
                ko.utils.arrayForEach(data.scores.sets, function(
                    setScore,
                    index
                ) {
                    var i = index + 1;
                    sets[i] = new Livescoring.Set(
                        i,
                        ko.unwrap(that.number) * 10 + i,
                        setScore,
                        that
                    );
                });
            }

            for (var i = 1; i <= Livescoring.SETS; i++) {
                if (!sets[i]) {
                    sets[i] = new Livescoring.Set(
                        i,
                        ko.unwrap(that.number) * 10 + i,
                        undefined,
                        that
                    );
                }
            }

            that.sets = ko.observableArray(_.values(sets));
        };

        that.fillSets(properties, data);

        that.score = ko.pureComputed(function() {
            var sets = [0, 0];

            ko.utils.arrayForEach(that.sets(), function(set) {
                if (set.hasScore()) {
                    if (set.scoreA() > set.scoreB()) {
                        sets[0]++;
                    } else {
                        sets[1]++;
                    }
                }
            });

            return sets;
        });

        // endresult?
        that.isComplete = ko.pureComputed(function() {
            var score = that.score(),
                scoreA = score[0],
                scoreB = score[1];
            return scoreA === 3 || scoreB === 3;
        });

        that.makesSense = ko.pureComputed(function() {
            var score = that.score(),
                scoreA = score[0],
                scoreB = score[1];
            return scoreA <= 3 && scoreB <= 3; // excludes 4:1, 1:4 and 5:0 0:5
        });

        that.hasAWon = ko.pureComputed(function() {
            return that.hasAWonViaSetScore() || that.hasAWonViaMatchScore();
        });

        that.hasBWon = ko.pureComputed(function() {
            return that.hasBWonViaSetScore() || that.hasBWonViaMatchScore();
        });

        that.hasAWonViaSetScore = ko.pureComputed(function() {
            var score = that.score(),
                scoreA = score[0],
                scoreB = score[1];

            if (!that.isComplete()) {
                return false;
            }

            return scoreA > scoreB;
        });

        that.hasAWonViaMatchScore = ko.pureComputed(function() {
            if (!that.matchScore.hasScore()) {
                return false;
            }
            var matchScore = that.matchScore.sets(),
                matchScoreA = matchScore[0],
                matchScoreB = matchScore[1];

            if (matchScoreA < 3) {
                return false;
            }

            return matchScoreA > matchScoreB;
        });

        that.hasBWonViaSetScore = ko.pureComputed(function() {
            var score = that.score(),
                scoreA = score[0],
                scoreB = score[1];

            if (!that.isComplete()) {
                return false;
            }

            return scoreB > scoreA;
        });

        that.hasBWonViaMatchScore = ko.pureComputed(function() {
            if (!that.matchScore.hasScore()) {
                return false;
            }
            var matchScore = that.matchScore.sets(),
                matchScoreA = matchScore[0],
                matchScoreB = matchScore[1];

            if (matchScoreB < 3) {
                return false;
            }

            return matchScoreB > matchScoreA;
        });

        /*
             displays the sets-score of the game
             considers a given matchScore
         */
        that.formattedScore = ko.pureComputed(function() {
            if (that.hasMatchScore()) {
                return that.matchScore.sets().join(":");
            }

            if (that.numberOfSets() > 0) {
                return that.score().join(":");
            }

            return "";
        });

        // returns always the result in sets
        that.formattedSetsScore = ko.pureComputed(function() {
            return that.score().join(":");
        });

        that.numberOfSets = ko.pureComputed(function() {
            var score = that.score();
            return score[0] + score[1];
        });

        that.formattedPoint = ko.pureComputed(function() {
            if (that.hasAWonViaSetScore()) return "1:0";
            if (that.hasBWonViaSetScore()) return "0:1";

            return "";
        });

        that.formattedPoints = ko.pureComputed(function() {
            if (!that.isComplete() && !that.matchScore.hasScore()) {
                return "";
            }

            return that.totalPoints().join(":");
        });

        that.beginEditting = function() {
            that.editMode(true);
            that.sets()[0].focus(true);
        };

        that.endEditting = function() {
            that.editMode(false);
        };

        that.hasMatchScore = ko.pureComputed(function() {
            return that.matchScore.hasScore();
        });
    };

    /*
        ViewModel: Livescoring.MatchScore

        the matchScore is only the set result (like 3:2 or 3:0) - it can be submitted indepently from the detailed points in the sets
        - match: Livescoring.Match
    */
    Livescoring.MatchScore = function(match) {
        var that = this;

        that.editMode = ko.observable(false);
        that.sending = ko.observable(false);
        that.focus = ko.observable(false);
        that.A = ko.observable(undefined);
        that.B = ko.observable(undefined);

        that.sets = ko.pureComputed(function() {
            return [that.A(), that.B()];
        });

        that.previous = ko.observable(that.sets());

        ko.utils.arrayForEach([that.A, that.B], function(scoreObservable) {
            var value = ko.observable(); // represents the typed in formValue, which is validated and then submitted

            scoreObservable.formValue = ko.computed({
                read: value,
                write: function(newValue) {
                    if (newValue == "" || newValue === undefined) {
                        value(undefined);
                    }

                    var setScore = parseInt(newValue, 10);

                    if (!_.isNaN(setScore)) {
                        value(setScore);
                    }
                }
            });
        });

        that.hasScore = ko.pureComputed(function() {
            var scoreA = that.A();
            var scoreB = that.B();

            return scoreA !== undefined || scoreB !== undefined;
        });

        that.reset = function() {
            that.A.formValue(undefined);
            that.B.formValue(undefined);
        };

        that.numberOfSets = ko.pureComputed(function() {
            if (!that.hasScore()) return 0;

            return that.A() + that.B();
        });

        that.beginEditting = function() {
            var dynamicScore = match.score();

            if (!that.hasScore()) {
                that.A(dynamicScore[0]);
                that.B(dynamicScore[1]);
                that.previous(that.sets()); // if we don't it would submit the dynamic result as a "change"
            }

            that.editMode(true);
            that.focus(true);
        };

        that.endEditting = function() {
            that.focus(false);
            that.editMode(false);
        };

        that.formValuesValidationError = ko.pureComputed(function() {
            // validation level2, we check if the matchScore has conflicts with the sets inserted, or of it is crap like: 3:3
            var scoreA = that.A.formValue();
            var scoreB = that.B.formValue();

            if (scoreA > 3 || scoreB > 3) return "Kein Satz kann größer 3 sein";
            if (scoreA >= 3 && scoreB >= 3)
                return (
                    [scoreA, scoreB].join(":") + " ist kein erlaubtes Ergebnis"
                );

            // check if it has conflicts with single set points
            var pointScore = match.score(),
                pointScoreA = pointScore[0],
                pointScoreB = pointScore[1];

            // e.g. if pointScore is 2:3 and score should be 0:3 its a conflict
            if (pointScoreA > scoreA || pointScoreB > scoreB)
                return "Dieses Satzergebnis widerspricht dem Ergebnis durch die  bereits bekannten Sätze. Bitte korrigiere die einzelnen Sätze, oder dein Satzergebnis.";

            var openSets = match.isComplete()
                ? 0
                : Livescoring.SETS - match.numberOfSets();

            if (
                Math.abs(pointScoreA - scoreA) > openSets ||
                Math.abs(pointScoreB - scoreB) > openSets
            )
                return "Dieses Satzergebnis is nicht mehr möglich. Bitte korrigiere die einzelnen Sätze, oder dein Satzergebnis.";
        });

        // both values set or both values undefined
        // e.g.: undefined:3 is not completed, undefined:undefined is completed (reset request)
        that.hasCompleteFormValues = ko.pureComputed(function() {
            var scoreA = that.A.formValue(),
                scoreB = that.B.formValue();
            return (
                (scoreA === undefined && scoreB === undefined) ||
                (scoreA !== undefined && scoreB !== undefined)
            );
        });

        that.hasValidFormValues = ko.pureComputed(function() {
            return (
                !that.hasCompleteFormValues() ||
                that.formValuesValidationError() === undefined
            );
        });

        // listen to the debounced formValues of both sets: if formValues are valid and different then the already scored set result, submit it, then take it a new values
        ko
            .pureComputed(function() {
                return [that.A.formValue(), that.B.formValue()];
            })
            .extend({
                rateLimit: {
                    timeout: Livescoring.times.matchChange,
                    method: "notifyWhenChangesStop"
                }
            })
            .subscribe(function(sets) {
                var isValid = that.hasValidFormValues();
                var isComplete = that.hasCompleteFormValues();
                var needsUpdate = !_.isEqual(that.previous(), sets);

                if (isComplete && isValid && needsUpdate) {
                    that.sending(true);

                    // special case: the pointScore in sets is the same as the matchScore, so we can delete the matchScore
                    if (_.isEqual(match.score(), sets)) {
                        sets = [undefined, undefined];
                    }

                    match.meeting
                        .updateMatchScore(match, sets)
                        .then(function() {
                            that.A(sets[0]);
                            that.B(sets[1]);
                            that.A.formValue(sets[0]);
                            that.B.formValue(sets[1]);
                            that.previous(sets);
                            that.endEditting();
                        })
                        .then(function() {
                            match.meeting.updateSortedMatches();
                        })
                        .always(function() {
                            that.sending(false);
                        });
                }
            });
    };

    /*
        ViewModel: Livescoring.Set

        a (table-tennis-)set like 11:9 or 14:16

        - number: runs from 1 to Livescoring.SETS
        - tabindex: the order in the whole meeting-form when "tab" is pressed on keyboard
        - score: the input of the points of the set in an array: [11,5] for shortscore "5"
        - match: Livescoring.Match
    */
    Livescoring.Set = function(number, tabindex, score, match) {
        var that = this;

        that.match = match;
        that.number = ko.observable(number);
        that.tabindex = ko.observable(tabindex);
        that.shortScore = ko.observable(undefined); // this is a string, to support "-0". -0 means 0:11 in score. -4 means 4:11 in score. 4 means 11:4 in score. 14 means 16:14 in score.
        that.scoreA = ko.observable(); // when shortscore is 4 this is 11
        that.scoreB = ko.observable(); // when shortscore is 4 this is 4
        that.focus = ko.observable(false);
        that.sending = ko.observable(false);

        // process input score, adjust shortScore
        if (_.isArray(score)) {
            that.scoreA(score[0]);
            that.scoreB(score[1]);

            that.shortScore(
                score[0] < score[1] ? "-" + score[0] : score[1].toString()
            );
        }

        // track for needsUpdate()
        that.shortScore.previous = ko.observable(that.shortScore());

        // this is the observable the gets bound to the input[text] with the textInput-binding that displays the shortscore
        that.formValue = ko.computed({
            read: that.shortScore,
            write: function(shortScore) {
                shortScore = shortScore.toString();

                // workaround for android, where - is not on the number-keyboard
                if (shortScore.substr(0, 1) === ".") {
                    shortScore = "-" + shortScore.substr(1);
                }

                if (shortScore == "") {
                    that.reset();
                } else if (shortScore !== "-") {
                    var isNegative = shortScore.substr(0, 1) === "-";

                    endOfInput = isNegative ? 3 : 2;
                    shortScore = shortScore.substring(0, endOfInput);

                    // save as string
                    that.shortScore(shortScore);

                    // continue as int
                    shortScore = parseInt(shortScore, 10);

                    if (isNegative) {
                        that.scoreA(Math.abs(shortScore));
                        that.scoreB(Math.max(11, Math.abs(shortScore) + 2));
                    } else {
                        that.scoreB(shortScore);
                        that.scoreA(Math.max(11, shortScore + 2));
                    }
                }
            }
        });

        // change the shortscore from 4 into -4 (11:4 -> 4:11)
        that.switchScore = function() {
            var shortScore = that.shortScore();

            if (!shortScore) return;

            var isNegative = shortScore.substr(0, 1) === "-";

            if (isNegative) {
                that.formValue(shortScore.substr(1));
            } else {
                that.formValue("-" + shortScore);
            }
        };

        that.deleteSetScore = function() {
            that.formValue("");
        };

        that.reset = function() {
            that.shortScore(undefined);
            that.scoreA(undefined);
            that.scoreB(undefined);
        };

        that.score = ko.pureComputed(function() {
            return [that.scoreA(), that.scoreB()];
        });

        that.hasScore = ko.pureComputed(function() {
            return that.scoreA() > 0 || that.scoreB() > 0;
        });

        // shows the score padded with &nbsp;
        that.formattedScore = ko.pureComputed(function() {
            if (!that.hasScore()) {
                // no detailed score (points) for this set
                if (
                    match.hasMatchScore() &&
                    match.matchScore.numberOfSets() >= that.number()
                ) {
                    return "--:--";
                } else {
                    return "&nbsp;";
                }
            }

            var scoreA = that.scoreA();
            var scoreB = that.scoreB();

            var formatted = "";
            if (scoreA < 10) {
                formatted += "&nbsp;";
            }
            formatted += scoreA;

            formatted += ":";

            formatted += scoreB;
            if (scoreB < 10) {
                formatted += "&nbsp;";
            }

            return formatted;
        });

        that.needsUpdate = ko.pureComputed(function() {
            return that.shortScore() !== that.shortScore.previous();
        });

        // after x miliseconds of no change in observable 'shortScore' send an update to the backend (if needed)
        that.shortScore
            .extend({
                rateLimit: {
                    timeout: Livescoring.times.setChange,
                    method: "notifyWhenChangesStop"
                }
            })
            .subscribe(function() {
                // keep in mind: even if the match does not make sense, the score should be submitted to server, otherwise score changes would be lost
                if (that.needsUpdate()) {
                    that.sending(true);

                    that.match.meeting
                        .updateSet(that)
                        .then(function() {
                            that.shortScore.previous(that.shortScore());
                        })
                        .always(function() {
                            that.sending(false);
                        });
                }
            });
    };

    var convertPlayers = function(team, grid) {
        team.playersById = {};

        obsArray = ko.observableArray([]);
        ko.utils.arrayForEach(team.players, function(player) {
            var playerModel = new Livescoring.Player(player);
            obsArray.push(playerModel);
            team.playersById[playerModel.id()] = playerModel;
        });
        team.players = obsArray;

        return team;
    };

    Livescoring.Meeting = function(grid, data, main) {
        var that = this;

        that.grid = grid;
        that.totalPoints = ko.observable();
        that.teamA = convertPlayers(data.teamA, grid);
        that.teamB = convertPlayers(data.teamB, grid);
        that.main = main;
        that.hasCompleteLineupForA = ko.observable(false);
        that.hasCompleteLineupForB = ko.observable(false);
        that.meetingStartTime = ko.observable(data.startTime);
        that.meetingEndTime = ko.observable(data.endTime);
        that.showTotalBallsAndSets = ko.observable(false);

        that.saveStartEndTime = function() {

            startDateIsValid = isValidTimeString(that.meetingStartTime());
            endDateIsValid = isValidTimeString(that.meetingEndTime());

            if(!startDateIsValid) {
                showCustomUserDialog("Bitte Spielbeginn überprüfen!","danger","lsJSMessageTarget");
            }

            if(!endDateIsValid) {
                showCustomUserDialog("Bitte Spielende überprüfen!","danger","lsJSMessageTarget");
            }

            if(!startDateIsValid || !endDateIsValid) {
                return;
            }

            var data = {
                meetingStartTime: that.meetingStartTime(),
                meetingEndTime: that.meetingEndTime(),
            };

            if (lsDebugMode) console.log("save times @ " + new Date());

            showCustomUserDialog("Spielbeginn und Spielende wurden gespeichert!","success","lsJSMessageTarget");

            return main.sendUpdate("/save-start-end-times", data);
        }

        /* create all matches and its parties, for the view of the whole meeting */
        that.fillPartiesAndMatches = function(grid) {
            that.parties = {};
            that.matches = {};
            var matchNumber = 1;

            ko.utils.arrayForEach(grid.matchSpecs, function(matchSpec) {
                ko.utils.arrayForEach(matchSpec, function(partyName) {
                    // like DA1 or B2
                    if (!that.parties.hasOwnProperty(partyName)) {
                        that.parties[partyName] = new Livescoring.Party(
                            partyName,
                            Livescoring.Party.createPlayerDummies(partyName),
                            { isDummy: true }
                        );
                    }
                });

                var matchName = matchSpec.join("-"); // like A1-B2 or DA3-DB3
                var matchNameWithoutAB = matchName.replace("A", "");
                var matchNameWithoutAB = matchNameWithoutAB.replace("B", "");

                that.matches[matchName] = new Livescoring.Match(
                    {
                        name: matchName,
                        nameForOutput: matchNameWithoutAB,
                        number: matchNumber++,
                        spec: matchSpec,
                        partyA: that.parties[matchSpec[0]], // new Party(that.parties['A1'])
                        partyB: that.parties[matchSpec[1]] // new Party(that.parties['B1'])
                    },
                    {
                        scores:
                            data.matches &&
                            data.matches.hasOwnProperty(matchName)
                                ? data.matches[matchName]
                                : undefined
                    },
                    that
                );
            });
        };

        that.fillPartiesAndMatches(grid);

        // lineup is an array with personids: ["NUxxx", "NUXXX"]
        that.fillLineup = function(lineup, team, teamChar) {
            var id, player, spec, party;
            var specs = [];

            // search for all parties an entry in data.lineup and fill its party with the livescoring.players
            ko.utils.objectForEach(that.parties, function(partyName, party) {
                if (lineup.hasOwnProperty(partyName)) {
                    // lineup.A3
                    var ids = _.isArray(lineup[partyName])
                            ? lineup[partyName]
                            : [lineup[partyName]],
                        players;

                    players = [];
                    ko.utils.arrayForEach(ids, function(id) {
                        var player = team.playersById[id];

                        if (player) {
                            players.push(player);
                        }
                    });

                    if (players.length) {
                        party.players(players);
                    }

                }
            });

            that["hasCompleteLineupFor" + teamChar](true);
        };

        if (data.teamA.lineup) {
            that.fillLineup(data.teamA.lineup, that.teamA, "A");
        }

        if (data.teamB.lineup) {
            that.fillLineup(data.teamB.lineup, that.teamB, "B");
        }

        // returns a list of all matches and updates the cumulatedScore in each match
        that.sortedMatches = ko.pureComputed(function() {
            return that.updateSortedMatches();
        });

        that.updateSortedMatches = function() {
            // ko can iterate only arrays, not objects
            var matches = [];

            var points = [0, 0];
            ko.utils.objectForEach(ko.unwrap(that.matches), function(
                key,
                match
            ) {
                if (match.hasAWon()) {
                    points[0]++;
                }

                if (match.hasBWon()) {
                    points[1]++;
                }

                match.totalPoints(_.clone(points));
                matches.push(match);
            });

            that.totalPoints(_.clone(points));

            return matches;
        };

        that.totalScore = {
            editMode: ko.observable(false),
            sending: ko.observable(false),
            beginEditting: function() {
                that.totalScore.editMode(true);
            },
            endEditting: function() {
                that.totalScore.editMode(false);
            },
            A: ko.observable(
                _.isArray(data.totalScore) ? data.totalScore[0] : undefined
            ),
            B: ko.observable(
                _.isArray(data.totalScore) ? data.totalScore[1] : undefined
            ),
            formatted: function() {
                return that.totalScore.A() + ":" + that.totalScore.B();
            }
        };

        that.totalScoreReset = function() {
            that.totalScore.A(undefined);
            that.totalScore.B(undefined);
            that.updateTotalScore(that.totalScore);
        };

        that.hasScoredTotal = ko.pureComputed(function() {
            return that.totalScore.A() > 0 || that.totalScore.B() > 0;
        });

        ko.utils.arrayForEach([that.totalScore.A, that.totalScore.B], function(
            scoreObservable
        ) {
            var value = ko.observable(); // represents the typed in formValue, which is validated and then submitted

            scoreObservable.formValue = ko.computed({
                read: value,
                write: function(newValue) {
                    if (newValue == "" || newValue === undefined) {
                        value(undefined);
                    }

                    var score = parseInt(newValue, 10);

                    if (!_.isNaN(score)) {
                        value(score);
                    }
                }
            });
        });

        // listen to the debounced formValues of both sets: if formValues are valid and different then the already scored set result, submit it, then take it a new values
        ko
            .pureComputed(function() {
                return [
                    that.totalScore.A.formValue(),
                    that.totalScore.B.formValue()
                ];
            })
            .extend({
                rateLimit: {
                    timeout: Livescoring.times.totalChange,
                    method: "notifyWhenChangesStop"
                }
            })
            .subscribe(function(totalScore) {
                if (
                    totalScore[0] !== undefined &&
                    totalScore[1] !== undefined &&
                    totalScore[0] <= 10 &&
                    totalScore[1] <= 10 &&
                    totalScore[0] >= 0 &&
                    totalScore[1] >= 0
                ) {
                    that.totalScore.sending(true);

                    that
                        .updateTotalScore(totalScore)
                        .then(function() {
                            that.totalScore.A(totalScore[0]);
                            that.totalScore.B(totalScore[1]);
                            that.totalScore.endEditting();
                        })
                        .always(function() {
                            that.totalScore.sending(false);
                        });
                }
            });

        // returns either the scored or the dynamic total score
        that.score = ko.pureComputed(function() {
            if (that.hasScoredTotal()) {
                // scored from a user
                return [that.totalScore.A(), that.totalScore.B()];
            }

            return that.totalPoints(); // dynamic
        });

        that.formattedPoints = ko.pureComputed(function() {
            return that.score().join(":");
        });

        that.isComplete = ko.pureComputed(function() {
            return that.isDraw() || that.winner() !== undefined;
        });

        that.scoreIsTransferable = ko.pureComputed(function() {
            // hasCompleteLineupForA + hasCompleteLineupForB is currently used to set the correct tab and to prevent a empty teamlineup submit, but setting one single player is enough to allow the lineup to besaved ... maybe we need another client site check for hasCompleteLineupForXYToTransfer which checks if all single and double player are set
            scoreIsTransferable = that.isComplete() && that.hasCompleteLineupForA() && that.hasCompleteLineupForB();
            return scoreIsTransferable;
        });

        that.isDraw = ko.pureComputed(function() {
            if (grid.draw == undefined) {
                return false;
            }
            return _.isEqual(that.score(), grid.draw);
        });

        that.winner = ko.pureComputed(function() {
            var points = that.score();

            if (points[0] >= grid.winPoint) return that.teamA;
            if (points[1] >= grid.winPoint) return that.teamB;

            return undefined;
        });

        that.calculateTotalBallsAndSets = function() {

            if(updateOfTotalBallsAndSetsInProgress == true) {
                return;
            }

            updateOfTotalBallsAndSetsInProgress = true;

            totalBalls = {
                "teamA": 0,
                "teamB": 0
            };

            $( ".aFormattedSetScore" ).each(function( index ) {
                theSetScore = $( this ).text().trim();
                if(theSetScore.length > 1 && theSetScore.indexOf("--") == -1) {
                    splittedScores = theSetScore.split(':');
                    totalBalls["teamA"] += parseInt(splittedScores[0]);
                    totalBalls["teamB"] += parseInt(splittedScores[1]);
                }
            });

            textForOutput = totalBalls["teamA"] + ":" + totalBalls["teamB"] + " Bälle";
            $("#totalBalls").text(textForOutput);


            totalSets = {
                "teamA": 0,
                "teamB": 0
            };

            $( ".oneFormattedScore span" ).each(function( index ) {
                theMatchScore = $( this ).text().trim();
                if(theMatchScore.length > 1 && theMatchScore.indexOf("--") == -1) {
                    splittedScores = theMatchScore.split(':');
                    totalSets["teamA"] += parseInt(splittedScores[0]);
                    totalSets["teamB"] += parseInt(splittedScores[1]);
                }
            });

            textForOutput = " | " + totalSets["teamA"] + ":" + totalSets["teamB"] + " Punkte";
            $("#totalSets").text(textForOutput);

            that.showTotalBallsAndSets(true);

            setTimeout(function() {
                updateOfTotalBallsAndSetsInProgress = false;
            }, 1500);
        };

        that.updateSet = function(set) {

            that.showTotalBallsAndSets(false);

            var data = {
                match: ko.unwrap(set.match.name),
                set: ko.unwrap(set.number),
                score: ko.unwrap(set.score),
                shortScore: ko.unwrap(set.shortScore),
                previous: ko.unwrap(set.shortScore.previous)
            };

            setTimeout(function() {
                that.calculateTotalBallsAndSets();
            }, 1500);

            return main.sendUpdate("/set-score", data);
        };

        that.updateMatchScore = function(match, sets) {
            //console.log(that.formattedPoints());
            var data = {
                match: ko.unwrap(match.name),
                score: sets
            };

            return main.sendUpdate("/match-score", data);
        };

        that.updateLineup = function(data) {
            return main.sendUpdate("/lineup", data);
        };

        that.updateTotalScore = function(result) {
            var data = {
                score: result
            };

            return main.sendUpdate("/total-score", data);
        };
    };

    // component to display the contents for one team in the "Aufstellung" tab
    // this component uses a long list of (lineup-)Items that represent a player, that is either a substitution or a player in the lineup and which is playing (optionally) in a double
    // we need this item-structure because we want to modifiy this structure with the form and then apply it to the mainModel, so that we can discard changes and apply a valid lineup in bulk
    // so when this component is registered it reads the doubles and singles for the items from the model
    // and when the component applies the lineup to the model it writes the doubles and singles to the model
    ko.components.register("team-lineup", {
        viewModel: function(params) {
            var that = this;
            var team = (that.team = params.team);
            var meeting = (that.meeting = params.meeting);
            var grid = meeting.grid;
            var teamChar = params.char; // "A" or "B"

            that.userAllowedToScore = params.userAllowedToScore;
            that.items = ko.observableArray([]);
            that.itemsByPlayer = {};

            that.forDoubles = function(iteree) {
                var d, party;
                for (var d = 1; d <= grid.maxDoubles; d++) {
                    party = meeting.parties["D" + teamChar + d.toString()];
                    if (party == undefined) {
                        grid.maxDoubles--; // special handling for Braunschweiger System
                    } else {
                        iteree(party, d);
                    }
                }
            };

            that.forSingles = function(iteree) {
                var i, party;
                for (var i = 1; i <= grid.maxPlayers; i++) {
                    party = meeting.parties[teamChar + i.toString()];
                    if (party == undefined) {
                        grid.maxPlayers--; // special handling for Braunschweiger System
                    } else {
                        iteree(party, i);
                    }
                }
            };

            ko.utils.arrayForEach(ko.unwrap(team.players), function(player) {
                var item = {
                    inLineup: ko.observable(false),
                    position: ko.observable(undefined), // 1-grid.maxPlayers
                    player: player,
                    double: ko.observable(undefined) // 1-grid.maxDoubles
                };

                that.items.push(item);
                that.itemsByPlayer[player.id()] = item;
            });

            // mark doubles from model in lineup-items
            that.forDoubles(function(party, d) {
                ko.utils.arrayForEach(party.players(), function(player) {
                    var item = that.itemsByPlayer[player.id()];

                    if (item) {
                        item.double(d);
                    }
                });
            });

            // mark item if stored in single positions from model
            that.forSingles(function(party, i) {
                var player = party.players()[0];
                var item = that.itemsByPlayer[player.id()];

                if (item) {
                    item.inLineup(true);
                }
            });

            that.chosenLineup = ko.pureComputed(function() {
                var position = 1;
                return ko.utils.arrayFilter(ko.unwrap(that.items), function(
                    item
                ) {
                    var inLineup = item.inLineup();

                    if (inLineup) {
                        item.position(position);
                        position++;
                    } else {
                        item.position(undefined);
                    }

                    return inLineup;
                });
            });

            that.fullPlayerGrid= ko.computed(function() {
                var items = [];

                ko.utils.arrayForEach(ko.unwrap(that.items), function(item) {
                    items.push(item);
                    item.position(undefined);
                    item.double(undefined);
                });

                return items;
            });


            // builds the actual doubles from the info in the dropdown
            that.chosenDoubles = ko.pureComputed(function() {
                var d,
                    party,
                    doubles = {};

                // collect each player in double
                ko.utils.arrayForEach(that.fullPlayerGrid(), function(item) {
                    d = item.double();

                    if (d) {
                        if (!doubles.hasOwnProperty(d)) {
                            doubles[d] = [];
                        }

                        doubles[d].push(item.player);
                    }
                });

                return doubles;
            });

            // chooses the first x players for the team for lineup
            that.defaultLineup = function() {
                var added = 1;
                ko.utils.arrayForEach(ko.unwrap(that.items), function(item) {
                    if (added <= grid.maxPlayers) {
                        item.inLineup(true);
                        added++;
                    } else {
                        item.inLineup(false);
                    }
                });
            };

            that.skipThroughLineUp = function() {
                if (meeting.main.activeTab() === "lineup-A") {
                    meeting.main.activeTab("lineup-B");
                } else {
                    meeting.main.activeTab("gamereport");
                }
            };

            that.sending = ko.observable(false);

            that.areDoublesValid = ko.pureComputed(function() {
                var doubles = _.values(that.chosenDoubles());

                if (doubles.length == 0) return true;

                return _.every(doubles, function(double) {
                    return double.length <= 2;
                });
            });

            that.isValid = ko.pureComputed(function() {
                return (
                    ko.unwrap(that.chosenLineup).length > 0 &&
                    that.areDoublesValid()
                );
            });

            // send lineup to server and wait for response
            that.update = function() {
                that.sending(true);

                var data = {
                    teamChar: teamChar,
                    lineup: {}
                };

                ko.utils.arrayForEach(that.chosenLineup(), function(item) {
                    data.lineup[teamChar + item.position()] = item.player.id(); // lineup["A3"] = "NUxxx"
                });

                ko.utils.objectForEach(that.chosenDoubles(), function(
                    d,
                    players
                ) {
                    data.lineup["D" + teamChar + d] = ko.utils.arrayMap(
                        players,
                        function(player) {
                            return player.id();
                        }
                    );
                });

                params.meeting
                    .updateLineup(data)
                    .then(function() {
                        that.applyLineup();
                        meeting["hasCompleteLineupFor" + teamChar](true);
                        meeting.main.setNextActiveTab();
                    })
                    .always(function() {
                        that.sending(false);
                    });
            };

            // sync the chosen lineup (and doubles) with the model
            that.applyLineup = function() {
                var i = 1, d, party, doubles = {};
                ko.utils.arrayForEach(that.chosenLineup(), function(item) {
                    party = meeting.parties[teamChar + i.toString()];

                    try {
                        party.players([item.player]);
                        party.isDummy(false);
                    } catch (err) {
                        //console.log(err);
                    }

                    d = item.double();

                    if (d) {
                        if (!doubles.hasOwnProperty(d)) {
                            doubles[d] = [];
                        }

                        doubles[d].push(item.player);
                    }

                    i++;
                });

                that.forDoubles(function(party, d) {
                    if (doubles[d]) {
                        // only one player selected? add the the same one again, if the same player is twice in a double, check later what that implies
                        if (doubles[d].length == 1) {
                            doubles[d].push(doubles[d][0]);
                        }

                        if (doubles[d].length == 2) {
                            party.players(doubles[d]);
                        }
                    }
                });
            };

            that.savedSinglesLineup = ko.pureComputed(function() {
                var lineup = [];
                var position = 1;

                that.forSingles(function(party, i) {
                    var player = party.players()[0];

                    lineup.push({
                        position: position,
                        player: player
                    });

                    position++;
                });

                return lineup;
            });

            that.savedDoublesLineup = ko.pureComputed(function() {
                var lineup = [];
                var num = 1;

                that.forDoubles(function(party, i) {
                    lineup.push({
                        num: num,
                        party: party
                    });

                    num++;
                });

                return lineup;
            });
        },
        template: { element: "team-lineup-component" }
    });

    ko.components.register("double-select", {
        viewModel: function(params) {
            var that = this;

            _.extend(that, params);

            that.doublesOptions = _.range(1, that.meeting.grid.maxDoubles + 1);

            that.doubleLabel = function(d) {
                return "D" + d.toString();
            };
        },
        template: { element: "double-select" }
    });

    // controls the tabs and contains the meeting for the page
    Livescoring.Main = function(meetingData, grid, props) {
        var that = this;

        ko.utils.objectForEach(props, function(prop, value) {
            that[prop] = ko.observable(value);
        });

        that.meeting = new Livescoring.Meeting(grid, meetingData, that);
        that.writeModeIsLive = ko.observable(false);
        that.allMatchKeys = Object.keys(that.meeting.matches);
        that.numberOfMatchesForThisMeeting = that.allMatchKeys.length;
        that.savedDoubles = meetingData.savedDoubles;
        that.maxSinglePositions = meetingData.maxSinglePositions;

        that.sendUpdate = function(url, data) {
            var q = $.Deferred();

            if (!that.writeModeIsLive()) {
                if (lsDebugMode)
                    console.log("WriteMode is off, changes are not saved");
                return q.resolve();
            }

            if (lsDebugMode) console.log(url + " will be called");

            var fullAjaxPayload = {};

            var fullUrl = "/clicktt/livescoring-api" + url;
            fullAjaxPayload["meetingId"] = meetingData.meetingId;
            fullAjaxPayload["data"] = data;

            var theJSON = JSON.stringify(fullAjaxPayload);

            $.ajax({
                type: "POST",
                url: fullUrl,
                data: { theJSON: theJSON },
                success: q.resolve()
            });

            return q.promise();
        };

        that.activeTab = ko.observable();

        that.setNextActiveTab = function() {
            if (!that.userAllowedToScore()) {
                that.activeTab("gamereport");
            } else if (!that.meeting.hasCompleteLineupForA()) {
                that.activeTab("lineup-A");
            } else if (!that.meeting.hasCompleteLineupForB()) {
                that.activeTab("lineup-B");
            } else {
                that.activeTab("gamereport");
            }
        };

        that.setNextActiveTab();

        $(window).trigger("load.bs.select.data-api");

        that.logInputChangeFromDb = function(match, what, oldValue, NewValue) {
            if (lsDebugMode) {
                console.log(
                    "Updated " +
                    match +
                    " " +
                    what +
                    " From Value " +
                    oldValue +
                    " to new Value " +
                    NewValue
                );
            }
        };

        that.updateTotalScoreInput = function(freshData) {
            if (freshData.length == 0 || freshData.length == "0:0") {
                $("#manualTotal").text("");
                $("#theTotalScore").show();
            } else {
                $("#manualTotal").text(freshData + " (Direkt gescort)");
                $("#theTotalScore").hide();
            }
        };

        that.updateMatchScoreInputs = function(match, freshData) {
            var currentValues = {
                set1: $("#" + freshData.matchId + " .set1").val(),
                set2: $("#" + freshData.matchId + " .set2").val(),
                set3: $("#" + freshData.matchId + " .set3").val(),
                set4: $("#" + freshData.matchId + " .set4").val(),
                set5: $("#" + freshData.matchId + " .set5").val(),
                matchSetA: $(
                    "#matchRowFor_" + freshData.matchId + " .matchSetA"
                ).val(),
                matchSetB: $(
                    "#matchRowFor_" + freshData.matchId + " .matchSetB"
                ).val()
            };

            for (var i = 1; i <= 5; i++) {
                var theField = $("#" + freshData.matchId + " .set" + i);
                // we only update the inputs if the value from DB ist different than the current value of the input an the input has no focus
                if (
                    currentValues["set" + i] !== freshData["set" + i] &&
                    !$(theField).is(":focus")
                ) {
                    $(theField)
                        .val(freshData["set" + i])
                        .change();
                    that.logInputChangeFromDb(
                        match,
                        "Set " + i,
                        currentValues["set" + i],
                        freshData["set" + i]
                    );
                }
            }

            if (currentValues.matchSetA !== freshData.matchScoreTeamA) {
                var theField = $(
                    "#matchRowFor_" + freshData.matchId + " .matchSetA"
                );
                if (!$(theField).is(":focus")) {
                    $(theField)
                        .val(freshData.matchScoreTeamA)
                        .change();
                }
            }
            if (currentValues.matchSetB !== freshData.matchScoreTeamB) {
                var theField = $(
                    "#matchRowFor_" + freshData.matchId + " .matchSetB"
                );
                if (!$(theField).is(":focus")) {
                    $(theField)
                        .val(freshData.matchScoreTeamB)
                        .change();
                }
            }

            if (that.numberOfMatchesForThisMeeting > 0) {
                that.numberOfMatchesForThisMeeting--;
            }

            if (that.numberOfMatchesForThisMeeting == 0) {
                if (!that.writeModeIsLive()) {
                    setTimeout(function() {
                        that.writeModeIsLive(true);
                        that.selectDoublesAfterPageLoad(that.savedDoubles);
                        if (lsDebugMode) {
                            console.log("WriteMode aktiviert");
                        }
                    }, Livescoring.times.enableWriteModeAfterLoadingLastScore);
                }
            }
        };

        that.selectDoublesAfterPageLoad = function(savedDoubles) {
            for (var personId in savedDoubles) {
                var optionValue = savedDoubles[personId];
                $("#rowForPersonId_"+personId+" select").val(optionValue).change();
            }
        };

        that.getScoresForMatch = function(match, meetingId) {
            var fullAjaxPayload = {};

            var fullUrl = "/clicktt/livescoring-api/get-match";
            fullAjaxPayload["meetingId"] = meetingId;
            fullAjaxPayload["matchId"] = match;

            var theJSON = JSON.stringify(fullAjaxPayload);

            $.ajax({
                type: protocollForAjaxCalls,
                url: fullUrl,
                data: { theJSON: theJSON }
            }).done(function(result) {
                that.updateMatchScoreInputs(match, result);
            });
        };

        that.getScoresForAllMatches = function(meetingId,allMatchKeys) {
            var fullAjaxPayload = {};

            var fullUrl = "/clicktt/livescoring-api/get-all-matches";
            fullAjaxPayload["meetingId"] = meetingId;
            fullAjaxPayload["allMatchKeys"] = allMatchKeys;

            var theJSON = JSON.stringify(fullAjaxPayload);

            $.ajax({
                type: protocollForAjaxCalls,
                url: fullUrl,
                data: { theJSON: theJSON }
            }).done(function(result) {
                result.map(aMatch => that.updateMatchScoreInputs(aMatch.matchId, aMatch));
            });
        };

        that.getManualTotal = function() {
            var fullAjaxPayload = {};

            var fullUrl = "/clicktt/livescoring-api/get-manual-total";
            fullAjaxPayload["meetingId"] = meetingData.meetingId;

            var theJSON = JSON.stringify(fullAjaxPayload);

            $.ajax({
                type: protocollForAjaxCalls,
                url: fullUrl,
                data: { theJSON: theJSON }
            }).done(function(result) {
                that.updateTotalScoreInput(result);
            });
        };

        that.keepAllThingsUpDoDate = function() {
            if (lsDebugMode) console.log("get scores @ " + new Date());
            if (!that.meeting.main.userAllowedToScore()) {
                that.getManualTotal();
            }
            updateAllMatches = !that.meeting.main.userAllowedToScore();
            updateAllMatches = true;
            if(!updateAllMatches) {
                for (match of that.allMatchKeys) {
                    that.getScoresForMatch(match, meetingData.meetingId);
                }
            } else {
                if (lsDebugMode) console.log("update whole meeting " + new Date());
                that.getScoresForAllMatches(meetingData.meetingId,that.allMatchKeys);
            }

            currentCalculatedTotalScore = $(
                "#currentCalculatedTotalScore"
            ).text();
            if (
                that.userAllowedToScore() &&
                currentCalculatedTotalScore.length > 0
            ) {
                var data = {
                    score: currentCalculatedTotalScore
                };
                return that.sendUpdate("/save-calculated-total", data);
            }
        };

        that.keepAllThingsUpDoDate();
        setInterval(
            that.keepAllThingsUpDoDate,
            that.userAllowedToScore()
                ? Livescoring.times.reloadScoredEveryEditMode
                : Livescoring.times.reloadScoredEveryViewOnlyMode
        );

        that.showReportMeeting = ko.observable(true);

        that.reportMeeting = function() {
            if (
                !confirm(
                    "Du möchtest diesen Spielbericht an myTischtennis.de melden, weil ein anderer User nachweislich falsche Ergebnisse erfasst oder das Livescoring nicht wie vorgesehen verwendet? Dann klicke auf OK, damit wir den Fall überprüfen können.\n\nSolltest du den Fall genauer erklären oder eine allgemeine Verbesserung zum Livescoring geben wollen, schreibe uns bitte eine E-Mail an info@myTischtennis.de."
                )
            ) {
                return;
            }

            var fullAjaxPayload = {};

            var fullUrl = "/clicktt/livescoring-api/report-meeting";
            fullAjaxPayload["meetingId"] = meetingData.meetingId;

            var theJSON = JSON.stringify(fullAjaxPayload);

            $.ajax({
                type: "POST",
                url: fullUrl,
                data: { theJSON: theJSON }
            }).done(function(result) {
                alert("Vielen Dank für deine Mithilfe!");
                that.showReportMeeting(false);
            });
        };
    };
})(window.ko, window.jQuery, window._);
