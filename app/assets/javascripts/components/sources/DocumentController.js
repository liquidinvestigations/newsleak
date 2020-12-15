/*
 * Copyright (C) 2016 Language Technology Group and Interactive Graphics Systems Group, Technische Universität Darmstadt, Germany
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

define([
    'angular',
    'ngSanitize',
    'ngMaterial',
    'contextMenu',
    'ui-bootstrap'
], function (angular) {
    'use strict';
    /**
     * document module:
     * - render document content
     * - load additional metdata/keywords for loaded document
     */
    angular.module('myApp.document', ['play.routing', 'ngSanitize', 'ngMaterial', 'ui.bootstrap.contextMenu', 'ui.bootstrap'])
        .directive('docContent', ['$compile', 'ObserverService', 'EntityService', 'graphProperties',  '_', function($compile, ObserverService, EntityService, graphProperties, _) {
            return {
                restrict: 'E',
                transclude: true,
                //replace: true,
                scope: {
                    // Need to set-up a bi-directional binding in order to pass an object not a string
                    document: '=',
                    reloadDoc: '&withparam'
                },
                link: function(scope, element, attrs) {
                    var content = scope.document.content;
                    var entities = scope.document.entities;
                    scope.addEntityFilter = function(id) {
                        var el = _.find(entities, function(e) { return e.id == id });
                        ObserverService.addItem({ type: 'entity', data: { id: id, description: el.name, item: el.name, type: el.type }});
                    };

                    scope.renderDoc = function() {

                        var highlights = scope.document.highlighted !== null ? calcHighlightOffsets(scope.document.highlighted, '<em>', '</em>') : [];
                        // The plain highlighter with query_string search highlights phrases as multiple words
                        // i.e. "Angela Merkel" -> <em> Angela </em> <em> Merkel </em>. Thus, we need to group
                        // those subsequent elements
                        var merged = groupSubsequentHighlights(highlights);
                        var marks = identifyOverlappingHighlights(entities, merged);

                        var container = element;
                        var offset = 0;
                        marks.forEach(function(e) {
                            var fragments = content.slice(offset, e.start).split('\n');
                            fragments.forEach(function(f, i) {
                                container.append(document.createTextNode(f));
                                if(fragments.length > 1 && i != fragments.length - 1) container.append(angular.element('<br />'));
                            });

                            var highlightElement = undefined;
                            if(_.has(e, 'nested') && (e.nested.start != e.start || e.nested.end != e.end)) {
                                // Two overlapping cases exist. In the first case, we need to append the inner element before the outer one.
                                // In the second case, we need to append it after the outer element.
                                // Case 1
                                // Angela Merkel
                                // Angela
                                // => <span> <span> Angela </span> Merkel </span>
                                // Case 2
                                // Angela Merkel
                                // ...... Merkel
                                // => <span> Angela <span> Merkel </span> </span>
                                if(e.type == 'full-text') {
                                    //Expectation: Nested is always the inner or same element e.g. [[Angela] Merkel]
                                    var innerElement = createNeHighlight(e.nested.id, e.nested.typeId, e.nested.name);
                                    if(e.nested.start == e.start) {
                                        highlightElement = createFulltextHighlight(e.name.substring(e.nested.end - e.start));
                                        highlightElement.prepend(innerElement);
                                    } else {
                                        highlightElement = createFulltextHighlight(e.name.substring(0, e.nested.start - e.start));
                                        highlightElement.append(innerElement)
                                    }
                                } else {
                                    var innerElement = createFulltextHighlight(e.nested.name);
                                    if(e.nested.start == e.start) {
                                        highlightElement = createNeHighlight(e.id, e.typeId, e.name.substring(e.nested.end - e.start));
                                        highlightElement.prepend(innerElement);

                                    } else {
                                        highlightElement = createNeHighlight(e.id, e.typeId, e.name.substring(0, e.nested.start - e.start));
                                        highlightElement.append(innerElement);
                                    }
                                }
                            } else if(e.type == 'full-text')  {
                                highlightElement = createFulltextHighlight(e.name);
                            } else {
                                highlightElement = createNeHighlight(e.id, e.typeId, e.name);
                            }
                            // Append marked element to DOM
                            var compiledElement = $compile(highlightElement)(scope);
                            container.append(compiledElement);
                            // Move the cursor
                            offset = _.has(e, 'nested') && e.nested.end > e.end ? e.nested.end : e.end;
                        });
                        container.append(document.createTextNode(content.slice(offset, content.length)));
                    };

                    function calcHighlightOffsets(text, delimiterStart, delimiterEnd) {
                        var offset = 0;
                        var markerChars = delimiterStart.length;
                        var elements = [];
                        while(true) {
                            var startTag = text.indexOf(delimiterStart, offset);
                            var endTag = text.indexOf(delimiterEnd, offset);
                            // If no more elements stop matching
                            if(startTag == -1 || endTag == -1) break;

                            var startElement = startTag + delimiterStart.length;
                            var match = text.substring(startElement, endTag);
                            elements.push({ start: startElement - markerChars, end: startElement - markerChars + match.length, name: match, type: 'full-text' });
                            // Adjust pointer
                            offset = (endTag + delimiterEnd.length);
                            markerChars += (delimiterStart.length + delimiterEnd.length);
                        }
                        return elements;
                    }

                    function groupSubsequentHighlights(elements) {
                        var grouped = elements.reduce(function(acc, el) {
                            var seq = acc.length > 0 ? acc.pop(): [];
                            // Running sequence
                            if(seq.length > 0 && _.last(seq).end == el.start - 1) {
                                seq.push(el);
                                acc.push(seq)
                            } else {
                                // End of sequence
                                if(seq.length > 0) acc.push(seq);
                                // Create new starting sequence
                                acc.push([el]);
                            }
                            return acc;
                        }, []);

                        var merged = grouped.map(function(seq) {
                            var start = _.first(seq).start;
                            var end = _.last(seq).end;
                            var name = _.pluck(seq, 'name').join(' ');
                            return { start: start, end: end, name: name, type: "full-text" };
                        });
                        return merged;
                    }

                    function identifyOverlappingHighlights(entities, fulltextElements) {
                        var sortedSpans = entities.concat(fulltextElements).sort(function(a, b) { return a.start - b.start; });
                        var res = sortedSpans.reduce(function(acc, e, i) {
                            // If it's not the last element and full-text match overlaps NE match (subsequent element is always the overlapping one)
                            //if(!_.isUndefined(sortedSpans[i+1]) && (sortedSpans[i+1].start == e.start || sortedSpans[i+1].end == e.end)) {
                            if(!_.isUndefined(sortedSpans[i+1]) && sortedSpans[i+1].start >= e.start && sortedSpans[i+1].start <= e.end) {
                                // Make sure the longest span is the parent
                                if (e.name.length > sortedSpans[i + 1].name.length) {
                                    e.nested = sortedSpans[i + 1];
                                    acc.push(e);
                                    // Mark next as skip
                                    sortedSpans[i + 1].omit = true;
                                } else {
                                    sortedSpans[i + 1].nested = e;
                                }
                            // No overlapping full-text and NE
                            } else if(!_.has(e, 'omit')) {
                                acc.push(e);
                            }
                            return acc;
                        }, []);
                        return res;
                    }

                    function createNeHighlight(id, typeId, name) {
                        var color = graphProperties.options['groups'][typeId]['color']['background'];
                        var innerElement = angular.element('<span ng-style="{ padding: 0, margin: 0, \'text-decoration\': none, \'border-bottom\': \'3px solid ' + color + '\'}"></span>');
                        innerElement.className = 'highlight-general';
                        var addFilter = angular.element('<a id='+ id +' ng-click="addEntityFilter(' + id +')" context-menu="contextMenu" style="text-decoration: none; cursor: pointer;"></a>');
                        addFilter.append(document.createTextNode(name));
                        innerElement.append(addFilter);
                        return innerElement;
                    }

                    function createFulltextHighlight(name) {
                        var outerElement = angular.element('<span style="padding: 0; margin: 0; background-color: #FFFF00"></span>');
                        outerElement.className = 'highlight-general';
                        outerElement.append(document.createTextNode(name));
                        return outerElement;
                    }
                    // contextMenu for Blacklisting
                    scope.contextMenu = [
                      ['Blacklist', function (scope, event) {
                        EntityService
                          .blacklist([
                            event.target.id
                          ]);
                        scope.$parent.observer.notifyObservers();
                        scope.$parent.reloadDoc(scope.document);
                      }],
                    ];

                    scope.$parent.loadBlacklists(scope.document);

                    // Init component
                    scope.renderDoc();
                }
            };
        }])
        .controller('DocumentController',
            [
                '$scope',
                '$http',
                '$q',
                '$templateRequest',
                '$sce',
                '$timeout',
                '$uibModal',
                '$log',
                '$document',
                '$filter',
                'playRoutes',
                '_',
                'sourceShareService',
                'ObserverService',
                'EntityService',
                function ($scope,
                          $http,
                          $q,
                          $templateRequest,
                          $sce,
                          $timeout,
                          $uibModal,
                          $log,
                          $document,
                          $filter,
                          playRoutes,
                          _,
                          sourceShareService,
                          ObserverService,
                          EntityService) {

                    var self = this;

                    $scope.sourceShared = sourceShareService;

                    $scope.tabs = $scope.sourceShared.tabs;

                    // Maps from doc id to list of tags
                    $scope.tags = {};
                    $scope.labels = $scope.sourceShared.labels;
                    // data for similar documents
                    $scope.similarDocsAvailable = false;
                    $scope.numOfSimilarDocs = 10;
                    $scope.similarDocuments = [];

                    self.numKeywords = 15;

                    $scope.removeTab = function (tab) {
                        var index = $scope.tabs.indexOf(tab);
                        $scope.tabs.splice(index, 1);
                        if($scope.tabs.length == 0){
                            EntityService.setToggleEntityGraph(true);
                            EntityService.setToggleKeywordGraph(true);
                        }
                    };

                    $scope.observer = ObserverService;

                    $scope.observer.subscribeReset(function() {
                        // Remove all open documents when reset is issued, but keep old bindings to the array.
                        $scope.tabs.length = 0;
                        // Update the document labels when collection is changed
                        updateTagLabels();
                    });

                    function init() {
                        updateTagLabels();
                    }

                    init();

                    $scope.open = function ($scope, doc, backdrop) {
                      var modalInstance = $uibModal.open({
                        templateUrl: 'whitelistModal.html',
                        animation: true,
                        component: 'modalComponent',
                        size: 'sm',
                        backdrop: backdrop,
                        resolve: {
                          parentScope: function() {
                            return $scope;
                          },
                          doc: function() {
                            return doc;
                          }
                        },
                        controller: ('ModalController', ['$scope', function($scope) {

                            var selectedEntity = $scope.$resolve.parentScope.selectedEntity;
                            var entityTypes = $scope.$resolve.parentScope.entityTypes;
                            var doc = $scope.$resolve.doc;

                            $scope.entityName = selectedEntity.text
                            $scope.entityTypes = entityTypes;
                            $scope.selectedType = '';
                            $scope.isEntityInDoc = $scope.$resolve.parentScope.isEntityInDoc;
                            $scope.isKeyword = $scope.$resolve.parentScope.isKeyword;
                            $scope.isKeyword = false;

                            $scope.toggleType = function (state) {
                              this.$resolve.parentScope.isNewType = !state;
                              $scope.selectedType = '';
                            }

                            $scope.toggleKeyword = function (state) {
                              this.$resolve.parentScope.isKeyword = !state;
                              $scope.selectedType = state === false ? 'key' : '';
                            }

                            $scope.ok = function () {
                              this.$resolve.parentScope.whitelist(selectedEntity, $scope.selectedType, doc);
                              this.modalClose();
                            };

                            $scope.cancel = function () {
                              this.$resolve.parentScope.isKeyword = false;
                              this.$resolve.parentScope.isNewType = false;
                              this.modalClose();
                            };

                            $scope.modalClose = function() {
                              this.$resolve.parentScope.isKeyword = false;
                              this.$close();
                            };
                          }
                        ])
                      });
                      modalInstance.result.then(function () {
                      }, function () {
                        $log.info('Modal dismissed at: ' + new Date());
                      });
                    };

                    $scope.retrieveKeywords = function(doc) {
                        var terms =  [];
                        playRoutes.controllers.DocumentController.retrieveKeywords(doc.id).get().then(function(response) {
                          if(response.data.keys){
                              for(let keyword of response.data.keys) {
                                  terms.push(keyword.Keyword);
                              }
                          }
                        });
                        console.log('returning Terms: ' + terms)
                        return terms;
                    };

                    $scope.retrieveLinks = function(doc) {
                    	    var links = _.pick(doc.meta, 'Link');
                        return links;
                    };

                    $scope.transformTag = function(tag, doc) {
                        // If it is an object, it's already a known tag
                        if (angular.isObject(tag)) {
                            return tag;
                        }
                        // Otherwise try to create new tag
                        $scope.addTag({ label: tag }, doc);
                        // Prevent the chip from being added. We add it with an id in
                        // the addTag method above.
                        return null;
                    };

                    function updateTagLabels() {
                        $scope.labels.length = 0;
                        // Fetch all available document labels for auto-complete
                        playRoutes.controllers.DocumentController.getTagLabels().get().then(function(response) {
                            response.data.labels.forEach(function(l) { $scope.labels.push(l); });
                        });
                    }

                    $scope.indexName = '';
                    function getIndexName() {
                      playRoutes.controllers.DocumentController.getIndexName().get().then(function(response) {
                          $scope.indexName = response.data.index;
                          console.log('index name: ' + $scope.indexName);
                      });
                    }

                    // get index name from the back end and print to the console
                    getIndexName();

                    $scope.initTags = function(doc) {
                        $scope.tags[doc.id] = [];
                        playRoutes.controllers.DocumentController.getTagsByDocId(doc.id).get().then(function(response) {
                            response.data.forEach(function(tag) {
                                $scope.tags[doc.id].push({ label: tag.label, id: tag.id });
                            });
                        });
                    };

                    $scope.addTag = function(tag, doc) {
                        // Do not add tag if already present
                        var match = _.findWhere($scope.tags[doc.id], { label: tag.label });
                        if(match) {
                            return;
                        }

                        playRoutes.controllers.DocumentController.addTag(doc.id, tag.label).get().then(function(response) {
                            $scope.tags[doc.id].push({ id: response.data.id , label: tag.label });
                            // Update labels
                            updateTagLabels();
                            if(EntityService.getTagsSelected()){
                                EntityService.reloadKeywordGraph(true);
                            }
                        });
                    };

                    $scope.removeTag = function(tag) {
                        playRoutes.controllers.DocumentController.removeTagById(tag.id).get().then(function(response) {
                            // Update labels
                            updateTagLabels();
                            if(EntityService.getTagsSelected()){
                                EntityService.reloadKeywordGraph(true);
                            }
                        });
                    };

                    $scope.querySearch = function(doc, query) {
                        var results = query ? $scope.labels.filter(createFilterFor(query)) : [];
                        return results;
                    };

                    $scope.isNewType = false;
                    $scope.isEntityInDoc = false;
                    $scope.isKeyword = false;

                    // Enable to select Entity and activate whitelisting modal
                    $scope.showSelectedEntity = function(doc) {
                        $scope.selectedEntity =  $scope.getSelectionEntity(doc.content);
                        var selectedDoc = $scope.tabs.find((t) => { return t.id === doc.id; });
                        var isInDoc = isEntityInDoc(selectedDoc, $scope.selectedEntity);
                        if (!isInDoc && ($scope.selectedEntity.text.length) > 0 && ($scope.selectedEntity.text !== ' ')) {
                          $scope.isEntityInDoc = false;
                          $scope.open($scope, doc, 'static');
                        } else if (isInDoc && ($scope.selectedEntity.text.length) > 0 && ($scope.selectedEntity.text !== ' ')){
                          $scope.isEntityInDoc = true;
                          $scope.open($scope, doc, 'true');
                        }
                    };

                    function isEntityInDoc(selectedDoc, selectedEntity) {
                      var entities = selectedDoc.entities.filter((e) =>
                        {
                          //avoids new entity contains / intersects / inside an existed entity
                          if (((e.start >= selectedEntity.start) &&
                              (e.end <= selectedEntity.end)) ||
                              ((e.start <= selectedEntity.start) &&
                              (e.end >= selectedEntity.end)) ||
                              ((e.start <= selectedEntity.start) &&
                              (e.end >= selectedEntity.start)) ||
                              ((e.start <= selectedEntity.end) &&
                              (e.end >= selectedEntity.end))
                            ) {
                              return e;
                            }
                        }
                      );
                      return entities.length > 0 ? true : false;
                    }

                    // Whitelist: Entiy Annotation and Keyword Insertion
                    $scope.whitelist = function(entity, type, doc){
                      type = type.replace(/\s/g,'');
                      $scope.isKeyword;
                      var blacklists = isBlacklisted(entity, type, $scope.isKeyword);
                      // Check whether it is an entity or keyword
                      if ($scope.isKeyword === true) {
                        // Keyword Insertion / Whitelisting
                        if (blacklists.length > 0) {
                          // If a keyword has already been listed in blacklists, we undoBlacklistingKeywords
                          playRoutes.controllers.KeywordNetworkController.undoBlacklistingKeywords(blacklists).get().then(function (response) {
                            $scope.observer.notifyObservers();
                            $scope.reloadDoc(doc);
                            EntityService.reloadKeywordGraph(true);
                          });
                        } else {
                          // Keyword insertion
                          $scope.esKeyWhitelist(entity.text, doc);
                        }
                      } else {
                        // The text is an entity
                        if (blacklists.length > 0) {
                          // If an entity has already been listed in blacklists, we undoBlacklistingByIds
                          playRoutes.controllers.EntityController.undoBlacklistingByIds([blacklists[0].id]).get().then(function(response) {
                            $scope.observer.notifyObservers();
                            $scope.reloadDoc(doc);
                            EntityService.reloadEntityGraph();
                          });
                        } else {
                          // Entity Annotation / Whitelisting
                          playRoutes.controllers.EntityController.getRecordedEntity(entity.text, type).get().then(function (response) {
                            // Checking if an entity has already in database
                            if (response.data.length > 0) {
                              // If yes, update the frequency of that entity
                              EntityService.whitelist(entity, type, doc.id, response.data[0].id);
                              $scope.createNewEntity(entity, type, doc, response.data[0].id);
                            } else {
                              // The entity is new, we need to create a new record and give it a new ID.
                              playRoutes.controllers.EntityController.whitelistEntity(entity.text, entity.start, entity.end, type, doc.id, "empty")
                              .get().then(function(response) {
                                  $scope.$emit('notifying-service-event', { parameter: entity, response: response });
                                  playRoutes.controllers.EntityController.getRecordedEntity(entity.text, type).get().then(function (response) {
                                    $scope.annotations = entity.annotations;
                                    $scope.esNewId = response.data[response.data.length-1].id;
                                    // Checking if annotations are more than one in one document
                                    if ($scope.annotations.length > 1) {
                                      for (var i in $scope.annotations) {
                                        var anno = $scope.annotations[i];
                                        $scope.annoIter = parseInt(i);
                                        if ($scope.annoIter !== 0) {
                                          playRoutes.controllers.EntityController.whitelistEntityOffset(anno.text, anno.start, anno.end, doc.id, $scope.esNewId).get().then(function (response) {
                                            if ($scope.annoIter === ($scope.annotations.length-1)) {
                                              $scope.esWhitelist(entity, type, doc);
                                            }
                                          });
                                        }
                                      }
                                    } else {
                                      $scope.esWhitelist(entity, type, doc);
                                    }
                                  });
                              });
                            }
                          });
                        }
                      }
                    };

                    // Get entityTypes from observer service
                    $scope.entityTypes = [];
                    $scope.observer.getEntityTypes().then(function (types) {
                        types.map(function (e) {
                            if (e.name !== null) {
                                $scope.entityTypes.push(e);
                            }
                        });
                    });

                    $scope.selectedType = '';
                    var doc = $scope.tabs;
                    $scope.getSelectionEntity = function(doc) {
                      var text = "";
                      var start = 0;
                      var end = 0;
                      var annotations = [];
                      if (window.getSelection) {
                         text = window.getSelection().toString();
                         // Global RegExp annotations
                         if (text.length > 0) {
                           text = text.trim();
                           start = doc.match(text).index;
                           end = start + text.length;
                           var regexScript = RegExp(text, 'g');
                           var iter;
                           while ((iter = regexScript.exec(doc)) !== null) {
                              annotations.push({text, start: iter.index, end: regexScript.lastIndex});
                            }
                         }
                      } else if (document.selection && document.selection.type != "Control") {
                         text = document.selection.createRange().text;
                      }
                      return {
                        text,
                        start,
                        end,
                        annotations
                      };
                    };

                    $scope.esKeyWhitelist = function(keyword, doc) {
                      playRoutes.controllers.DocumentController
                        .getKeywordsByDoc(doc.id).get().then(function (response) {
                        var option = response.data.option;
                        if (option !== 'None') {
                          $scope.createNewKeyword(keyword, doc);
                        } else {
                          $scope.createInitKeyword(keyword, doc);
                        }
                      });
                    };

                    $scope.createInitKeyword = function(keyword, doc) {
                      playRoutes.controllers.DocumentController
                      .createInitKeyword(doc.id, keyword).get().then(function (response) {
                        $scope.observer.notifyObservers();
                        $scope.reloadDoc(doc);
                        EntityService.reloadKeywordGraph(true);
                      });
                    };

                    $scope.createNewKeyword = function(keyword, doc) {
                      playRoutes.controllers.DocumentController
                      .createNewKeyword(doc.id, keyword).get().then(function (response) {
                        $scope.observer.notifyObservers();
                        $scope.reloadDoc(doc);
                        EntityService.reloadKeywordGraph(true);
                      });
                    };

                    $scope.esWhitelist = function(entity, typeEnt, doc) {
                      playRoutes.controllers.DocumentController
                        .getESEntitiesByDoc(doc.id).get().then(function (response) {
                        var option = response.data.option;
                        if (option !== 'None') {
                          $scope.createNewEntity(entity, typeEnt, doc);
                        } else {
                          $scope.createInitEntity(entity, typeEnt, doc);
                        }
                      });
                    };

                    $scope.createInitEntity = function(entity, typeEnt, doc, entId = null) {
                      entId = entId === null ? $scope.esNewId : entId;
                      playRoutes.controllers.DocumentController
                      .createInitEntity(doc.id, entId, entity.text, typeEnt).get().then(function (response) {
                          $scope.isNewType === false ?
                            $scope.checkNewEntityType(entity, typeEnt, doc, entId)
                            :
                            $scope.createInitEntityType(entity, typeEnt, doc);
                      });
                    };

                    $scope.createNewEntity = function(entity, typeEnt, doc, entId = null) {
                      entId = entId === null ? $scope.esNewId : entId;
                      playRoutes.controllers.DocumentController
                      .createNewEntity(doc.id, entId, entity.text, typeEnt).get().then(function (response) {
                          $scope.isNewType === false ?
                            $scope.checkNewEntityType(entity, typeEnt, doc, entId)
                            :
                            $scope.createInitEntityType(entity, typeEnt, doc);
                      });
                    };

                    $scope.checkNewEntityType = function(entity, typeEnt, doc, entId = null) {
                      typeEnt = typeEnt.toLowerCase();
                      playRoutes.controllers.DocumentController
                      .getEntitiesTypeByDoc(doc.id, typeEnt).get().then(function (response) {
                        var option = response.data.option;
                        if (option !== 'None') {
                          $scope.createNewEntityType(entity, typeEnt, doc);
                        } else {
                          $scope.createInitEntityType(entity, typeEnt, doc);
                        }
                      });
                    };

                    $scope.createNewEntityType = function(entity, typeEnt, doc, entId = null) {
                      var suffixType = typeEnt.toLowerCase();
                      entId = entId === null ? $scope.esNewId : entId;
                      playRoutes.controllers.DocumentController
                      .createNewEntityType(doc.id, entId, entity.text, typeEnt).get().then(function (response) {
                        $scope.esNewEntityType = response;
                        $scope.observer.notifyObservers();
                        $scope.reloadDoc(doc);
                        EntityService.reloadEntityGraph();
                      });
                    };


                    $scope.createInitEntityType = function(entity, typeEnt, doc) {

                      var suffixType = typeEnt.toLowerCase();
                      var entId = $scope.esNewId;

                      playRoutes.controllers.DocumentController
                      .createInitEntityType(doc.id, entId, entity.text, typeEnt).get().then(function (response) {
                        $scope.esNewEntityType = response;
                        $scope.observer.notifyObservers();
                        $scope.reloadDoc(doc);
                        EntityService.reloadEntityGraph();
                      });
                    };

                    $scope.blacklists = [];
                    $scope.loadBlacklists = function(doc) {
                      playRoutes.controllers.EntityController.getBlacklistsByDoc(doc.id).get().then(function (response) {
                        $scope.blacklists = response.data;
                        playRoutes.controllers.EntityController.getBlacklistedKeywords(doc.id).get().then(function (response) {
                            let i = 1;
                            for(let item of response.data){
                                $scope.blacklists.push({
                                    // id: Long, name: String, entityType: String, freq: Int
                                    id: i,
                                    name: item,
                                    entityType: 'KEYWORD',
                                    freq: 1
                                });
                                i++;
                            }
                        });
                      });
                    };

                    //gets the ids and similarity scores (Lucene score) of similar documents from elasticsearch
                    $scope.getSimilarDocsElasticsearch = function (doc) {
                        console.log("Getting similar documents with method 'Elastic for document:" + doc.id);
                        var docids = [];
                        var docIdsAndScores = [];
                        var similarDocs = [];
                        playRoutes.controllers.DocumentController.getMoreLikeThis(doc.id, $scope.numOfSimilarDocs).get().then(function(response) {
                            docids = Object.keys(response.data);
                            docIdsAndScores = response.data;
                            return $scope.getDocs(docids, docIdsAndScores, true);
                             }).then( function(transformedDocs) {
                                transformedDocs.map(doc => similarDocs.push(doc));
                        });
                        return similarDocs;
                        };

                    //gets documents for the before retrieved ids, transforms them in the necessary structure and adds them to the list of similar documents
                    $scope.getDocs = function (docids, docIdsAndScores, reverseOrder) {
                        return playRoutes.controllers.DocumentController.getDocsByIds(docids).get().then(function(response) {
                            var docs = response.data.docs;
                            console.log ("getting transformed docs");
                            var transformedDocs = $scope.transformDocuments(docs, docIdsAndScores);
                            return transformedDocs;
                        });
                    };

                    //transforms the documents into the data structure that is required by the document list view. All content remains unchanged
                    $scope.transformDocuments = function (docs, docIdsAndScores) {
                        var transformedDocs = [];
                        angular.forEach(docs, function (doc) {
                            var currentDoc = {
                                id: doc.id,
                                content: doc.content,
                                highlighted: doc.highlighted,
                                score: docIdsAndScores[doc.id],
                                metadata: {}
                            };

                            //transforms metadata into the data structure required by the document list viewe
                            angular.forEach(doc.metadata, function (metadata) {
                                if (!currentDoc.metadata.hasOwnProperty(metadata.key)) {
                                    currentDoc.metadata[metadata.key] = [];
                                }
                                currentDoc.metadata[metadata.key].push({
                                    'val': metadata.val,
                                    'type': metadata.type
                                });
                            });

                            transformedDocs.push(currentDoc);
                        });
                        console.log ("returning " + transformedDocs.length + " transformed documents" );
                        return transformedDocs;
                    };

                    $scope.similarDocsAvailable = function(doc) {
                       if ($scope.similarDocuments.some((item) => item.similarityParent == doc.id)) {
                        return true;
                       }
                       else {
                       return false;
                       }
                    };

                    //opens a document
                    $scope.loadFullDocument = function (doc) {
                        EntityService.setToggleEntityGraph(true);
                        EntityService.setToggleKeywordGraph(false);

                        // Focus open tab if document is already opened
                        if ($scope.isDocumentOpen(doc.id)) {
                            var index = _.findIndex($scope.sourceShared.tabs, function (t) {
                                return t.id == doc.id;
                            });
                            // Skip first network tab
                            $scope.selectedTab.index = index + 1;
                        } else {
                            var editItem = {
                                type: 'openDoc',
                                data: {
                                    id: doc.id,
                                    description: "#" + doc.id,
                                    item: "#" + doc.id
                                }
                            };
                            $scope.observer.addItem(editItem);

                            playRoutes.controllers.EntityController.getEntitiesByDoc(doc.id).get().then(function (response) {
                                // Provide document controller with document information
                                $scope.sourceShared.tabs.push({
                                    id: doc.id,
                                    title: doc.id,
                                    content: doc.content,
                                    highlighted: doc.highlighted,
                                    meta: doc.metadata,
                                    entities: response.data
                                });
                            });
                        }
                    };

                    $scope.isDocumentOpen = function (id) {
                        var index = _.findIndex($scope.sourceShared.tabs, function (t) {
                            return t.id == id;
                        });
                        return index != -1;
                    };

                    function isBlacklisted(entity, type, isKeyword) {
                      var isBlacklisted = [];
                      if (isKeyword) {
                        $scope.blacklists.filter((e) =>
                          {
                            if((e.entityType === 'KEYWORD') && (e.name === entity.text)){
                                return isBlacklisted.push(e.name);
                            }
                          }
                        );
                      } else {
                        isBlacklisted = $scope.blacklists.filter((e) =>
                          {
                            if ((e.name === entity.text) &&
                                (e.start === entity.start) &&
                                (e.end === entity.end) &&
                                (e.type === type)
                              ) {
                                return e;
                              }
                          }
                        );
                      }
                      return isBlacklisted;
                    }

                    $scope.reloadDoc = function(doc) {
                      $scope.removeTab(doc);
                      var editItem = {
                          type: 'openDoc',
                          data: {
                              id: doc.id,
                              description: "#" + doc.id,
                              item: "#" + doc.id
                          }
                      };

                      $scope.observer.addItem(editItem);

                      playRoutes.controllers.EntityController.getEntitiesByDoc(doc.id).get().then(function (response) {
                          // Provide document controller with document information
                          $scope.sourceShared.tabs.push({
                              id: doc.id,
                              title: doc.id,
                              content: doc.content,
                              highlighted: doc.highlighted,
                              meta: doc.metadata,
                              entities: response.data
                          });
                      });

                      EntityService.setToggleKeywordGraph(false);
                    };

                    function createFilterFor(query) {
                        var lowercaseQuery = angular.lowercase(query);
                        return function filterFn(label) {
                            return (label.toLowerCase().indexOf(lowercaseQuery) === 0);
                        };
                    }
                }
            ]);
});
