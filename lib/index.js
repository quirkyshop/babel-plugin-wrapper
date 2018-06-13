const {
  addDefault
} = require('@babel/helper-module-imports');

function camel2Underline(_str) {
  const str = _str[0].toLowerCase() + _str.substr(1);

  return str.replace(/([A-Z])/g, $1 => `_${$1.toLowerCase()}`);
}

function libNameFormat(name) {
  return "_lib_" + name.toLowerCase();
}

function wrapperFormat(name) {
  return '_' + camel2Underline(name.replace(/\//g, '_'));
}

function wrapperResultFormat(name) {
  return '_wrapper_result_' + name;
}

module.exports = function (babel) {
  var t = babel.types;
  const wrapperPrefix = 'noform/dist/wrapper/';
  const importTraverseObject = {
    ExpressionStatement: function (path) {// debugger;
    },

    ImportDeclaration(path, data) {
      const {
        opts = {},
        runtimeData
      } = data;
      path.skip();
      var source = '';
      var target = [];
      var sourceNode = path.node.source;
      var specifiersNode = path.node.specifiers;

      if (t.isStringLiteral(sourceNode)) {
        source = sourceNode.value;
      } // is noform wrapper 


      let specificParams = [];
      let specificRefs = [];

      if (source.startsWith(wrapperPrefix)) {
        const sourceKind = source.split(wrapperPrefix)[1];
        const wrapperResult = wrapperResultFormat(sourceKind);

        if (Array.isArray(specifiersNode)) {
          specifiersNode.forEach(item => {
            if (t.isImportSpecifier(item)) {
              target.push(item.local.name);
              if (!runtimeData[source]) runtimeData[source] = {};
              runtimeData[source][item.local.name] = {
                parent: path
              }; // paramters for wrapper

              const formatLibName = libNameFormat(item.local.name);
              specificParams.push(t.objectProperty(t.identifier(item.local.name), t.identifier(formatLibName)));
              specificRefs.push(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(item.local.name), t.memberExpression(t.identifier(wrapperResult), t.identifier(item.local.name)))]));
            }
          });
        }

        path.replaceWithMultiple([t.variableDeclaration('const', [t.variableDeclarator(t.identifier(wrapperResult), t.callExpression(t.identifier(wrapperFormat(source)), [t.objectExpression(specificParams)]))])].concat(specificRefs));
      }
    }

  };

  function handleAdd(file, runtimeData, opts = {}) {
    const prefix = 'lib';
    const wrapperLibNames = Object.keys(runtimeData);
    wrapperLibNames.forEach(name => {
      const libDeps = runtimeData[name];
      const wrapperLibName = name.split(wrapperPrefix)[1];
      Object.keys(libDeps).forEach(libName => {
        const lowerLibName = libName.toLowerCase();
        const sourcePath = `${wrapperLibName}/${prefix}/${lowerLibName}`;
        addDefault(file.path, sourcePath, {
          nameHint: libNameFormat(libName)
        });
        console.log('======*****===', sourcePath);
      });
      addDefault(file.path, name, {
        nameHint: wrapperFormat(name)
      });
    });
  }

  return {
    pre(path) {
      this.runtimeData = {};
    },

    visitor: {
      Program(path, data) {
        path.traverse(importTraverseObject, {
          opts: data.opts,
          runtimeData: this.runtimeData
        });
        handleAdd(data.file, this.runtimeData, data.opts);
      }

    },

    post() {
      delete this.runtimeData;
    }

  };
};