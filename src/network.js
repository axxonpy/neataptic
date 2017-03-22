/* Export */
if (module) module.exports = Network;

/* Import */
var Neuron  = require('./neuron')
,   Layer   = require('./layer')
,   Trainer = require('./trainer')
,   methods = require('./methods')

/* Shorten var names */
var Mutate     = methods.Mutate
,   Squash     = methods.Squash
,   Crossover  = methods.Crossover
,   Selection  = methods.Selection
,   Generation = methods.Generation
,   Pooling    = methods.Pooling
,   Cost       = methods.Cost
,   Connection = methods.Connection;
/*******************************************************************************************
                                         NETWORK
*******************************************************************************************/

/**
 * Creates a neural network
 */
function Network(layers) {
  if (typeof layers != 'undefined') {
    this.layers = layers || {
      input: null,
      hidden: {},
      output: null
    };
    this.optimized = null;
  }
}

Network.prototype = {

  /**
   * Feed-forward activation of all layers to get an output
   */
  activate: function(input) {

    if (this.optimized === false)
    {
      this.layers.input.activate(input);
      for (var layer in this.layers.hidden)
        this.layers.hidden[layer].activate();
      return this.layers.output.activate();
    }
    else
    {
      if (this.optimized == null)
        this.optimize();
      return this.optimized.activate(input);
    }
  },

  /**
   * Back-propagate the error through the network
   */
  propagate: function(rate, target) {

    if (this.optimized === false)
    {
      this.layers.output.propagate(rate, target);
      var reverse = [];
      for (var layer in this.layers.hidden)
        reverse.push(this.layers.hidden[layer]);
      reverse.reverse();
      for (var layer in reverse)
        reverse[layer].propagate(rate);
    }
    else
    {
      if (this.optimized == null)
        this.optimize();
      this.optimized.propagate(rate, target);
    }
  },

  /**
   * Projects a connection a network or a layer
   */
  project: function(node, type, weights) {
    if (this.optimized){
      this.optimized.reset();
    }

    if (node instanceof Network){
      return this.layers.output.project(node.layers.input, type, weights);
    }

    if (node instanceof Layer){
      return this.layers.output.project(node, type, weights);
    }

    if(node instanceof Neuron){
      return this.layers.output.project(node, type, weights);
    }

    throw new Error("Node must be a Neuron, Layer or Network");
  },

  /*
   * Breaks all connections so they can be reconnected again
   */
  disconnect: function(){
    this.optimized.reset();
    this.layers.input.disconnect();

    for(var layer in this.layers.hidden){
      this.layers.hidden[layer].disconnect();
    }

    this.layers.output.disconnect();
  },

  /*
   * Connects all the layers in an ALL to ALL fashion
   */
   connect: function(){
     this.optimized.reset();
     this.layers.input.project(this.layers.hidden[0]);

     for(var i = 0; i < this.layers.hidden.length - 1; i++){
       this.layers.hidden[i].project(this.layers.hidden[i+1])
     }

     this.layers.hidden[this.layers.hidden.length - 1].project(this.layers.output);
   },

  /**
   * Lets this network gate a connection
   */
  gate: function(connection, type) {
    if (this.optimized)
      this.optimized.reset();
    this.layers.output.gate(connection, type);
  },

  /**
   * Clear all elegibility traces and extended elegibility traces
   * (the network forgets its context, but not what was trained)
   */
  clear: function() {
    this.restore();

    var inputLayer = this.layers.input,
      outputLayer = this.layers.output;

    inputLayer.clear();
    for (var layer in this.layers.hidden) {
      this.layers.hidden[layer].clear();
    }
    outputLayer.clear();

    if (this.optimized)
      this.optimized.reset();
  },

  /**
   * Resets all weights and clears all traces
   */
  reset: function() {
    this.restore();

    var inputLayer = this.layers.input,
      outputLayer = this.layers.output;

    inputLayer.reset();
    for (var layer in this.layers.hidden) {
      var hiddenLayer = this.layers.hidden[layer];
      hiddenLayer.reset();
    }
    outputLayer.reset();

    if (this.optimized)
      this.optimized.reset();
  },

  /**
   * Hardcodes the behaviour of the whole network intoa single optimized function
   */
  optimize: function() {
    var that = this;
    var optimized = {};
    var neurons = this.neurons();

    for (var i in neurons) {
      var neuron = neurons[i].neuron;
      var layer = neurons[i].layer;
      while (neuron.neuron)
        neuron = neuron.neuron;
      optimized = neuron.optimize(optimized, layer);
    }
    for (var i in optimized.propagation_sentences)
      optimized.propagation_sentences[i].reverse();
    optimized.propagation_sentences.reverse();

    var hardcode = "";
    hardcode += "var F = Float64Array ? new Float64Array(" + optimized.memory +
      ") : []; ";
    for (var i in optimized.variables)
      hardcode += "F[" + optimized.variables[i].id + "] = " + (optimized.variables[
        i].value || 0) + "; ";
    hardcode += "var activate = function(input){\n";
    for (var i in optimized.inputs)
      hardcode += "F[" + optimized.inputs[i] + "] = input[" + i + "]; ";
    for (var currentLayer in optimized.activation_sentences) {
      if (optimized.activation_sentences[currentLayer].length > 0) {
        for (var currentNeuron in optimized.activation_sentences[currentLayer]) {
          hardcode += optimized.activation_sentences[currentLayer][currentNeuron].join(" ");
          hardcode += optimized.trace_sentences[currentLayer][currentNeuron].join(" ");
        }
      }
    }
    hardcode += " var output = []; "
    for (var i in optimized.outputs)
      hardcode += "output[" + i + "] = F[" + optimized.outputs[i] + "]; ";
    hardcode += "return output; }; "
    hardcode += "var propagate = function(rate, target){\n";
    hardcode += "F[" + optimized.variables.rate.id + "] = rate; ";
    for (var i in optimized.targets)
      hardcode += "F[" + optimized.targets[i] + "] = target[" + i + "]; ";
    for (var currentLayer in optimized.propagation_sentences)
      for (var currentNeuron in optimized.propagation_sentences[currentLayer])
        hardcode += optimized.propagation_sentences[currentLayer][currentNeuron].join(" ") + " ";
    hardcode += " };\n";
    hardcode +=
      "var ownership = function(memoryBuffer){\nF = memoryBuffer;\nthis.memory = F;\n};\n";
    hardcode +=
      "return {\nmemory: F,\nactivate: activate,\npropagate: propagate,\nownership: ownership\n};";
    hardcode = hardcode.split(";").join(";\n");

    var constructor = new Function(hardcode);

    var network = constructor();
    network.data = {
      variables: optimized.variables,
      activate: optimized.activation_sentences,
      propagate: optimized.propagation_sentences,
      trace: optimized.trace_sentences,
      inputs: optimized.inputs,
      outputs: optimized.outputs,
      check_activation: this.activate,
      check_propagation: this.propagate
    }

    network.reset = function() {
      if (that.optimized) {
        that.optimized = null;
        that.activate = network.data.check_activation;
        that.propagate = network.data.check_propagation;
      }
    }

    this.optimized = network;
    this.activate = network.activate;
    this.propagate = network.propagate;
  },

  /**
   * Restores all the values from the optimized network to their respective
   * objects in order to manipulate the network
   */
  restore: function() {
    if (!this.optimized)
      return;

    var optimized = this.optimized;

    var getValue = function() {
      var args = Array.prototype.slice.call(arguments);

      var unit = args.shift();
      var prop = args.pop();

      var id = prop + '_';
      for (var property in args)
        id += args[property] + '_';
      id += unit.ID;

      var memory = optimized.memory;
      var variables = optimized.data.variables;

      if (id in variables)
        return memory[variables[id].id];
      return 0;
    }

    var list = this.neurons();

    // link id's to positions in the array
    var ids = {};
    for (var i in list) {
      var neuron = list[i].neuron;
      while (neuron.neuron)
        neuron = neuron.neuron;

      neuron.state = getValue(neuron, 'state');
      neuron.old = getValue(neuron, 'old');
      neuron.activation = getValue(neuron, 'activation');
      neuron.bias = getValue(neuron, 'bias');

      for (var input in neuron.trace.elegibility)
        neuron.trace.elegibility[input] = getValue(neuron, 'trace',
          'elegibility', input);

      for (var gated in neuron.trace.extended)
        for (var input in neuron.trace.extended[gated])
          neuron.trace.extended[gated][input] = getValue(neuron, 'trace',
            'extended', gated, input);
    }

    // get connections
    for (var i in list) {
      var neuron = list[i].neuron;
      while (neuron.neuron)
        neuron = neuron.neuron;

      for (var j in neuron.connections.projected) {
        var connection = neuron.connections.projected[j];
        connection.weight = getValue(connection, 'weight');
        connection.gain = getValue(connection, 'gain');
      }
    }
  },

  /**
   * Returns all the neurons in the network
   */
  neurons: function() {
    var neurons = [];

    var inputLayer = this.layers.input.neurons(),
      outputLayer = this.layers.output.neurons();

    for (var neuron in inputLayer)
      neurons.push({
        neuron: inputLayer[neuron],
        layer: 'input'
      });

    for (var layer in this.layers.hidden) {
      var hiddenLayer = this.layers.hidden[layer].neurons();
      for (var neuron in hiddenLayer)
        neurons.push({
          neuron: hiddenLayer[neuron],
          layer: layer
        });
    }
    for (var neuron in outputLayer)
      neurons.push({
        neuron: outputLayer[neuron],
        layer: 'output'
      });

    return neurons;
  },

  /**
   * Returns incoming and outgoing connections
   */
  connections: function(){
    // Input layer
    var connections = this.layers.input.connections();

    // Hidden layers
    for(var layer in this.layers.hidden){
      for(var neuron in this.layers.hidden[layer].list){
        for(var connType in this.layers.hidden[layer].list[neuron].connections){
          for(var conn in this.layers.hidden[layer].list[neuron].connections[connType]){
            connections[connType][conn] = this.layers.hidden[layer].list[neuron].connections[connType][conn];
          }
        }
      }
    }

    // Output layer
    for(var neuron in this.layers.output.list){
      for(var connType in this.layers.output.list[neuron].connections){
        for(var conn in this.layers.output.list[neuron].connections[connType]){
          connections[connType][conn] = this.layers.output.list[neuron].connections[connType][conn];
        }
      }
    }

    return connections;
  },

  /**
   * Gives the input size of the network
   */
  inputs: function() {
    return this.layers.input.size;
  },

  /**
   * Gives the output size of the network
   */
  outputs: function() {
    return this.layers.output.size;
  },

  /**
   * Sets the layers of the network
   */
  set: function(layers) {

    this.layers = layers;
    if (this.optimized)
      this.optimized.reset();
  },

  /**
   * Toggle hardcode optimization
   */
  setOptimize: function(bool){
    this.restore();
    if (this.optimized)
      this.optimized.reset();
    this.optimized = bool? null : false;
  },

  /**
   * Mutates the network
   */
  mutate: function(method){
    method = method || Mutate.MODIFY_RANDOM_WEIGHT;
    switch(method){
      case Mutate.SWAP_WEIGHT:
        // will be updated soon, connectionType is irrelevant because all
        // connections can be found in either .projected or .input (they are represented twice)
        var neuron1Index = Math.floor(Math.random()*this.neurons().length);
        var neuron2Index = Math.floor(Math.random()*this.neurons().length);

        // can't be same neuron
        while(neuron2Index == neuron1Index){
          neuron2Index = Math.floor(Math.random()*this.neurons().length);
        }

        var neuron1 = this.neurons()[neuron1Index].neuron;
        var neuron2 = this.neurons()[neuron2Index].neuron;

        var connectionType1 = Object.keys(neuron1.connections);
        var connectionTypes2 = Object.keys(neuron2.connections);

        for(var i = 2;i >= 0; i--){
          if(Object.keys(neuron1.connections[connectionType1[i]]).length == 0){
            connectionType1.splice(i, 1);
          }
          if(Object.keys(neuron2.connections[connectionTypes2[i]]).length == 0){
            connectionTypes2.splice(i, 1);
          }
        }

        connectionType1 = connectionType1[Math.floor(Math.random()*connectionType1.length)];
        var connectionKeys1 = Object.keys(neuron1.connections[connectionType1]);
        var connection1 = connectionKeys1[Math.floor(Math.random()*connectionKeys1.length)];

        // the input conn of one neuron could be the output conn of the other
        var connection2 = connection1;
        while(connection2 == connection1){
          var connectionType2 = connectionTypes2[Math.floor(Math.random()*connectionTypes2.length)];
          var connectionKeys2 = Object.keys(neuron2.connections[connectionType2]);
          var connection2 = connectionKeys2[Math.floor(Math.random()*connectionKeys2.length)];
        }

        var temp = neuron1.connections[connectionType1][connection1].weight;
        neuron1.connections[connectionType1][connection1].weight = neuron2.connections[connectionType2][connection2].weight;
        neuron2.connections[connectionType2][connection2].weight = temp;
        break;
      case Mutate.SWAP_BIAS:
        // neuron can't be input; this bias is not used
        var neuron1Index = Math.floor(Math.random() * (this.neurons().length - this.inputs()) + this.inputs());
        var neuron2Index = Math.floor(Math.random() * (this.neurons().length - this.inputs()) + this.inputs());

        // can't be same neuron
        while(neuron2Index == neuron1Index){
          neuron2Index = Math.floor(Math.random()*this.neurons().length);
        }

        var neuron1 = this.neurons()[neuron1Index].neuron;
        var neuron2 = this.neurons()[neuron2Index].neuron;

        var temp = neuron1.bias;
        neuron1.bias = neuron2.bias;
        neuron2.bias = temp;
        break;
      case Mutate.MODIFY_RANDOM_BIAS:
        // neuron can't be input; this bias is not used
        var neuron = Math.floor(Math.random() * (this.neurons().length - this.inputs()) + this.inputs());
        var modification = Math.random() * (Mutate.MODIFY_RANDOM_BIAS.config.max - Mutate.MODIFY_RANDOM_BIAS.config.min) + Mutate.MODIFY_RANDOM_BIAS.config.min;
        this.neurons()[neuron].neuron.bias += modification;
        break;
      case Mutate.MODIFY_RANDOM_WEIGHT:
        // will be updated soon, connectionType is irrelevant because all
        // connections can be found in either .projected or .input (they are represented twice)
        var neuron = Math.floor(Math.random()*this.neurons().length);
        var neuron = this.neurons()[neuron].neuron;
        var connectionType = Object.keys(neuron.connections);

        for(var i = connectionType.length-1;i >= 0; i--){
          if(Object.keys(neuron.connections[connectionType[i]]).length == 0){
            connectionType.splice(i, 1);
          }
        }

        connectionType = connectionType[Math.floor(Math.random()*connectionType.length)];
        var connectionKeys = Object.keys(neuron.connections[connectionType]);
        var connection = connectionKeys[Math.floor(Math.random()*connectionKeys.length)];

        var modification = Math.random() * (Mutate.MODIFY_RANDOM_WEIGHT.config.max - Mutate.MODIFY_RANDOM_WEIGHT.config.min) + Mutate.MODIFY_RANDOM_WEIGHT.config.min;
        neuron.connections[connectionType][connection].weight += modification;
        break;
      case Mutate.MODIFY_NEURONS:
        // Select random hidden layer to add/remove a neuron
        var layerIndex = Math.floor(this.layers.hidden.length * Math.random());
        var layer = this.layers.hidden[layerIndex];

        if(Math.random() >= 0.5){
          // remove a neuron
          var index = Math.floor(layer.list.length * Math.random());
          var neuron = layer.list[index];

          // remove all connections to and from this neuron in the network
          neuron.connections = {};

          list = (layerIndex == 0) ? this.layers.input.list : this.layers.hidden[layerIndex-1].list;
          for(var n in list){
            for(var conn in list[n].connections.projected){
              if(list[n].connections.projected[conn].to == neuron){
                delete list[n].connections.projected[conn];
              }
            }
          }

          list = (layerIndex == this.layers.hidden.length - 1) ? this.layers.output.list : this.layers.hidden[layerIndex+1].list;
          for(var n in list){
            for(var conn in list[n].connections.inputs){
              if(list[n].connections.inputs[conn].from == neuron){
                delete list[n].connections.inputs[conn];
              }
            }
          }

          layer.list.splice(index, 1);
          layer.size--;
        } else {
          // add a neuron
          var neuron = new Neuron();

          // project FROM
          list = (layerIndex == 0) ? this.layers.input.list : this.layers.hidden[layerIndex-1].list;
          for(var n in list){
            list[n].project(neuron);
          }

          // project TO
          list = (layerIndex == this.layers.hidden.length - 1) ? this.layers.output.list : this.layers.hidden[layerIndex+1].list;
          for(var n in this.layers.output.list){
            neuron.project(this.layers.output.list[n]);
          }

          layer.add(neuron);
        }
        break;
      case Mutate.MODIFY_CONNECTIONS:
        // decide to make or break a connection
        if(Math.random() >= 0.5){
          // remove a connection to a certain neuron
          var neuron;
          while(neuron == null || Object.keys(neuron.connections.inputs).length == 0){
            neuron = Math.floor(Math.random()*this.neurons().length);
            neuron = this.neurons()[neuron].neuron;
          }

          var connections = neuron.connections.inputs;
          var key = Object.keys(connections)[Math.floor(Object.keys(connections).length * Math.random())];
          var fromID = connections[key].from.ID;

          delete connections[key];

          for(var n in this.neurons()){
            if(this.neurons()[n].neuron.ID == fromID){
              delete this.neurons()[n].neuron.connections.projected[key];
              break;
            }
          }

          // check if neuron is 'dead', a.k.a receives no more activation
          if(Object.keys(connections).length == 0){
            for(var n in this.neurons()){
              var fromConnections = this.neurons()[n].neuron.connections.inputs;
              var keys = Object.keys(fromConnections);

              for(var conn in keys){
                if(fromConnections[keys[conn]].from.ID == neuron.ID){
                  delete this.neurons()[n].neuron.connections.inputs[keys[conn]];
                }
              }
            }
          }
          break;
        } else {
          var neuron1;
          var neuron2;
          // and neuron2 > neuron1, no memory connections unless specified
          while(neuron2 == null){
            var neuron1Index = Math.floor(Math.random() * (this.neurons().length - this.outputs())); // can't be an output neuron
            var minBound = Math.max(neuron1Index+1, this.inputs());
            var neuron2Index = Math.floor(Math.random() * (this.neurons().length - minBound) + minBound); // shold be > neuron1Index, also can't be an input neuron
            neuron1 = this.neurons()[neuron1Index].neuron;
            neuron2 = this.neurons()[neuron2Index].neuron;

            for(var connection in neuron1.connections.projected){
              if(neuron1.connections.projected[connection].to == neuron2){
                neuron2 = null; // these neurons are already connected
              }
            }
          }

          neuron1.project(neuron2);
        }
        break;
      case Mutate.MODIFY_SQUASH:
        // neuron can't be input; this activation is not squashed
        var neuron = Math.floor(Math.random() * (this.neurons().length - this.inputs()) + this.inputs());
        var squash = Math.floor(Math.random()*Mutate.MODIFY_SQUASH.config.allowed.length);

        // Should really be a NEW squash
        while(Mutate.MODIFY_SQUASH.config.allowed[squash] == this.neurons()[neuron].neuron.squash){
          squash = Math.floor(Math.random()*Mutate.MODIFY_SQUASH.config.allowed.length);
        }

        this.neurons()[neuron].neuron.squash = Mutate.MODIFY_SQUASH.config.allowed[squash];
    }
  },

  /**
   * Convert the network to a json
   */
  toJSON: function(ignoreTraces) {

    this.restore();

    var list = this.neurons();
    var neurons = [];
    var connections = [];

    // link id's to positions in the array
    var ids = {};
    for (var i in list) {
      var neuron = list[i].neuron;
      while (neuron.neuron)
        neuron = neuron.neuron;
      ids[neuron.ID] = i;
      var copy = neuron.toJSON();

      copy.layer = list[i].layer;

      neurons.push(copy);
    }

    // get connections
    for (var i in list) {
      var neuron = list[i].neuron;
      while (neuron.neuron)
        neuron = neuron.neuron;

      for (var j in neuron.connections.projected) {
        var connection = neuron.connections.projected[j];
        connections.push({
          from: ids[connection.from.ID],
          to: ids[connection.to.ID],
          weight: connection.weight,
          gater: connection.gater ? ids[connection.gater.ID] : null,
        });
      }
      if (neuron.selfconnected())
        connections.push({
          from: ids[neuron.ID],
          to: ids[neuron.ID],
          weight: neuron.selfconnection.weight,
          gater: neuron.selfconnection.gater ? ids[neuron.selfconnection.gater.ID] : null,
        });
    }

    return {
      neurons: neurons,
      connections: connections
    }
  },

  /**
   * Export the topology into dot language which can be visualized as graphs using dot
   * @example: console.log(net.toDotLang());
   *           $ node example.js > example.dot
   *           $ dot example.dot -Tpng > out.png
   */
  toDot: function(edgeConnection) {
    if (! typeof edgeConnection)
      edgeConnection = false;
    var code = "digraph nn {\n    rankdir = BT\n";
    var layers = [this.layers.input].concat(this.layers.hidden, this.layers.output);
    for (var layer in layers) {
      for (var to in layers[layer].connectedTo) { // projections
        var connection = layers[layer].connectedTo[to];
        var layerTo = connection.to;
        var size = connection.size;
        var layerID = layers.indexOf(layers[layer]);
        var layerToID = layers.indexOf(layerTo);
        /* http://stackoverflow.com/questions/26845540/connect-edges-with-graph-dot
         * DOT does not support edge-to-edge connections
         * This workaround produces somewhat weird graphs ...
        */
        if ( edgeConnection) {
          if (connection.gatedfrom.length) {
            var fakeNode = "fake" + layerID + "_" + layerToID;
            code += "    " + fakeNode +
              " [label = \"\", shape = point, width = 0.01, height = 0.01]\n";
            code += "    " + layerID + " -> " + fakeNode + " [label = " + size + ", arrowhead = none]\n";
            code += "    " + fakeNode + " -> " + layerToID + "\n";
          } else
            code += "    " + layerID + " -> " + layerToID + " [label = " + size + "]\n";
          for (var from in connection.gatedfrom) { // gatings
            var layerfrom = connection.gatedfrom[from].layer;
            var layerfromID = layers.indexOf(layerfrom);
            code += "    " + layerfromID + " -> " + fakeNode + " [color = blue]\n";
          }
        } else {
          code += "    " + layerID + " -> " + layerToID + " [label = " + size + "]\n";
          for (var from in connection.gatedfrom) { // gatings
            var layerfrom = connection.gatedfrom[from].layer;
            var layerfromID = layers.indexOf(layerfrom);
            code += "    " + layerfromID + " -> " + layerToID + " [color = blue]\n";
          }
        }
      }
    }
    code += "}\n";
    return {
      code: code,
      link: "https://chart.googleapis.com/chart?chl=" + escape(code.replace("/ /g", "+")) + "&cht=gv"
    }
  },

  /**
   * Creates a standalone function of the network
   */
  standalone: function() {
    if (!this.optimized)
      this.optimize();

    var data = this.optimized.data;

    // build activation function
    var activation = "function (input) {\n";

    // build inputs
    for (var i in data.inputs)
      activation += "F[" + data.inputs[i] + "] = input[" + i + "];\n";

    // build network activation
    for (var neuron in data.activate) { // shouldn't this be layer?
      for (var sentence in data.activate[neuron])
        activation += data.activate[neuron][sentence].join('') + "\n";
    }

    // build outputs
    activation += "var output = [];\n";
    for (var i in data.outputs)
      activation += "output[" + i + "] = F[" + data.outputs[i] + "];\n";
    activation += "return output;\n}";

    // reference all the positions in memory
    var memory = activation.match(/F\[(\d+)\]/g);
    var dimension = 0;
    var ids = {};
    for (var address in memory) {
      var tmp = memory[address].match(/\d+/)[0];
      if (!(tmp in ids)) {
        ids[tmp] = dimension++;
      }
    }
    var hardcode = "F = {\n";
    for (var i in ids)
      hardcode += ids[i] + ": " + this.optimized.memory[i] + ",\n";
    hardcode = hardcode.substring(0, hardcode.length - 2) + "\n};\n";
    hardcode = "var run = " + activation.replace(/F\[(\d+)]/g, function(
      index) {
      return 'F[' + ids[index.match(/\d+/)[0]] + ']'
    }).replace("{\n", "{\n" + hardcode + "") + ";\n";
    hardcode += "return run";

    // return standalone function
    return new Function(hardcode)();
  },

  /**
   * Return a HTML5 WebWorker specialized on training the network stored in `memory`.
   * Train based on the given dataSet and options.
   * The worker returns the updated `memory` when done.
   */
  worker: function(memory, set, options) {
    // Copy the options and set defaults (options might be different for each worker)
    var workerOptions = {};
    if(options) workerOptions = options;
    workerOptions.rate = options.rate || .2;
    workerOptions.iterations = options.iterations || 100000;
    workerOptions.error = options.error || .005;
    workerOptions.cost = options.cost || null;
    workerOptions.crossValidate = options.crossValidate || null;

    // Cost function might be different for each worker
    costFunction = "var cost = " + (options && options.cost || this.cost || Cost.MSE) + ";\n";
    var workerFunction = Network.getWorkerSharedFunctions();
    workerFunction = workerFunction.replace(/var cost = options && options\.cost \|\| this\.cost \|\| Trainer\.cost\.MSE;/g, costFunction);

    // Set what we do when training is finished
    workerFunction = workerFunction.replace('return results;',
                      'postMessage({action: "done", message: results, memoryBuffer: F}, [F.buffer]);');

    // Replace log with postmessage
    workerFunction = workerFunction.replace("console.log('iterations', iterations, 'error', error, 'rate', currentRate)",
              "postMessage({action: 'log', message: {\n" +
                  "iterations: iterations,\n" +
                  "error: error,\n" +
                  "rate: currentRate\n" +
                "}\n" +
              "})");

    // Replace schedule with postmessage
    workerFunction = workerFunction.replace("abort = this.schedule.do({ error: error, iterations: iterations, rate: currentRate })",
              "postMessage({action: 'schedule', message: {\n" +
                  "iterations: iterations,\n" +
                  "error: error,\n" +
                  "rate: currentRate\n" +
                "}\n" +
              "})");

    if (!this.optimized)
      this.optimize();

    var hardcode = "var inputs = " + this.optimized.data.inputs.length + ";\n";
    hardcode += "var outputs = " + this.optimized.data.outputs.length + ";\n";
    hardcode += "var F =  new Float64Array([" + this.optimized.memory.toString() + "]);\n";
    hardcode += "var activate = " + this.optimized.activate.toString() + ";\n";
    hardcode += "var propagate = " + this.optimized.propagate.toString() + ";\n";
    hardcode +=
        "onmessage = function(e) {\n" +
          "if (e.data.action == 'startTraining') {\n" +
            "train(" + JSON.stringify(set) + "," + JSON.stringify(workerOptions) + ");\n" +
          "}\n" +
        "}";

    var workerSourceCode = workerFunction + '\n' + hardcode;
    var blob = new Blob([workerSourceCode]);
    var blobURL = window.URL.createObjectURL(blob);

    return new Worker(blobURL);
  },

  /**
   * Returns a copy of the network
   */
  clone: function() {
    return Network.fromJSON(this.toJSON());
  }
};

/**
 * Creates a static String to store the source code of the functions
 *  that are identical for all the workers (train, _trainSet, test)
 *
 * @return {String} Source code that can train a network inside a worker.
 * @static
 */
Network.getWorkerSharedFunctions = function() {
  // If we already computed the source code for the shared functions
  if(typeof Network._SHARED_WORKER_FUNCTIONS !== 'undefined')
    return Network._SHARED_WORKER_FUNCTIONS;

  // Otherwise compute and return the source code
  // We compute them by simply copying the source code of the train, _trainSet and test functions
  //  using the .toString() method

  // Load and name the train function
  var train_f = Trainer.prototype.train.toString();
  train_f = train_f.replace('function (set', 'function train(set') + '\n';

  // Load and name the _trainSet function
  var _trainSet_f = Trainer.prototype._trainSet.toString().replace(/this.network./g, '');
  _trainSet_f = _trainSet_f.replace('function (set', 'function _trainSet(set') + '\n';
  _trainSet_f = _trainSet_f.replace('this.crossValidate', 'crossValidate');
  _trainSet_f = _trainSet_f.replace('crossValidate = true', 'crossValidate = { }');

  // Load and name the test function
  var test_f = Trainer.prototype.test.toString().replace(/this.network./g, '');
  test_f = test_f.replace('function (set', 'function test(set') + '\n';

  return Network._SHARED_WORKER_FUNCTIONS = train_f + _trainSet_f + test_f;
};

/**
 * Create a network from a json
 */
Network.fromJSON = function(json) {
  var neurons = [];

  var layers = {
    input: new Layer(),
    hidden: [],
    output: new Layer()
  };

  for (var i in json.neurons) {
    var config = json.neurons[i];

    var neuron = Neuron.fromJSON(config);
    neurons.push(neuron);

    if (config.layer == 'input')
      layers.input.add(neuron);
    else if (config.layer == 'output')
      layers.output.add(neuron);
    else {
      if (typeof layers.hidden[config.layer] == 'undefined')
        layers.hidden[config.layer] = new Layer();
      layers.hidden[config.layer].add(neuron);
    }
  }

  for (var i in json.connections) {
    var config = json.connections[i];
    var from = neurons[config.from];
    var to = neurons[config.to];
    var weight = config.weight;
    var gater = neurons[config.gater];

    var connection = from.project(to, weight);
    if (gater)
      gater.gate(connection);
  }

  return new Network(layers);
};

/**
 * Creates a new network from two parent networks
 */
Network.crossOver = function(network1, network2, method){
  method = method || Crossover.UNIFORM;

  var network1 = network1.toJSON();
  var network2 = network2.toJSON()
  var offspring = Network.fromJSON(network1).toJSON(); // copy

  switch(method){
    case Crossover.UNIFORM:
      for(var i = 0; i < offspring.neurons.length; i++){
        offspring.neurons[i].bias = Math.random() >= 0.5 ? network1.neurons[i].bias : network2.neurons[i].bias;
        offspring.neurons[i].squash = Math.random() >= 0.5 ? network1.neurons[i].squash : network2.neurons[i].squash;
      }
      for(var i = 0; i < offspring.connections.length; i++){
        offspring.connections[i].weight = Math.random() >= 0.5 ? network1.connections[i].weight : network2.connections[i].weight;
      }
      break;
    case Crossover.AVERAGE:
      for(var i = 0; i < offspring.neurons.length; i++){
        var bias1 = network1.neurons[i].bias;
        var bias2 = network2.neurons[i].bias;
        offspring.neurons[i].bias = (bias1 + bias2) / 2;

        // Squash has to be random.. can't average
        offspring.neurons[i].squash = Math.random() >= 0.5 ? network1.neurons[i].squash : network2.neurons[i].squash;
      }

      for(var i = 0; i < offspring.connections.length; i++){
        var weight1 = network1.connections[i].weight;
        var weight2 = network2.connections[i].weight;
        offspring.connections[i].weight = (weight1 + weight2) / 2;
      }
      break;
    case Crossover.SINGLE_POINT:
      for(var i = 0; i < offspring.neurons.length; i++){
        if(i / offspring.neurons.length < Crossover.SINGLE_POINT[0]){
          offspring.neurons[i].bias = network1.neurons[i].bias;
          offspring.neurons[i].squash = network1.neurons[i].squash;
        } else {
          offspring.neurons[i].bias = network2.neurons[i].bias;
          offspring.neurons[i].squash = network2.neurons[i].squash;
        }
      }
      for(var i = 0; i < offspring.connections.length; i++){
        if(i / offspring.connections.length < Crossover.SINGLE_POINT[0]){
          offspring.connections[i].weight = network1.connections[i].weight;
        } else {
          offspring.connections[i].weight = network2.connections[i].weight;
        }
      }
      break;
    case Crossover.TWO_POINT:
      for(var i = 0; i < offspring.neurons.length; i++){
        if(i / offspring.neurons.length < Crossover.SINGLE_POINT[0] || i / offspring.neurons.length > Crossover.SINGLE_POINT[1]){
          offspring.neurons[i].bias = network1.neurons[i].bias;
          offspring.neurons[i].squash = network1.neurons[i].squash;
        } else {
          offspring.neurons[i].bias = network2.neurons[i].bias;
          offspring.neurons[i].squash = network2.neurons[i].squash;
        }
      }
      for(var i = 0; i < offspring.connections.length; i++){
        if(i / offspring.connections.length < Crossover.SINGLE_POINT[0] || i / offspring.connections.length > Crossover.SINGLE_POINT[1]){
          offspring.connections[i].weight = network1.connections[i].weight;
        } else {
          offspring.connections[i].weight = network2.connections[i].weight;
        }
      }
      break;
  }

  return Network.fromJSON(offspring);
}

/**
 * Creates a new network by merging to networks into one
 */
Network.merge = function(network1, network2){
  // copy the networks for unique id's
  network1 = Network.fromJSON(network1.toJSON());
  network2 = Network.fromJSON(network2.toJSON());

  var inputLayer = network1.layers.input;
  var hiddenLayers = [];

  for(var i in network1.layers.hidden){
    hiddenLayers.push(network1.layers.hidden[i]);
  }

  // used to convert ID's to indexes
  var ids = [];
  for(var i in network2.layers.input.list){
    ids.push(network2.layers.input.list[i].ID);
  }

  // move connections (input and outputlayers are merged)
  for(var neuron in network2.layers.hidden[0].list){
    for(var conn in network2.layers.hidden[0].list[neuron].connections.inputs){
      var index = ids.indexOf(network2.layers.hidden[0].list[neuron].connections.inputs[conn].from.ID);
      network2.layers.hidden[0].list[neuron].connections.inputs[conn].from = network1.layers.output.list[index];
      network1.layers.output.list[index].connections.projected[network2.layers.hidden[0].list[neuron].connections.inputs[conn].ID] = network2.layers.hidden[0].list[neuron].connections.inputs[conn];
    }
  }

  hiddenLayers.push(network1.layers.output);

  for(var i in network2.layers.hidden){
    hiddenLayers.push(network2.layers.hidden[i]);
  }

  var outputLayer = network2.layers.output;

  return new Network({
    input: inputLayer,
    hidden: hiddenLayers,
    output: outputLayer
  });
}
