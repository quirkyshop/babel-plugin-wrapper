const getSpecImport = require('./utils/getSpecImport');
const { addSideEffect, addDefault, addNamed } = require('@babel/helper-module-imports');

module.exports = function(babel) {
  var t = babel.types;
  function moriMethod(name) {
    var expr = t.memberExpression(
      t.identifier('mori'),
      t.identifier(name)
    );
  
    expr.isClean = true;
    return expr;
  }

  const idTraverseObject = {
    JSXIdentifier(path, {runtimeData}) {
      const { parentPath } = path
      const { name } = path.node
  
      if (
        parentPath.isJSXOpeningElement() && parentPath.get('name') === path
        || parentPath.isJSXMemberExpression() && parentPath.get('object') === path
      ) {
        if (runtimeData[name]) {
          delete runtimeData[name]
        }
      }
    },
    Identifier(path, {runtimeData}) {
      const { parentPath } = path
      const { name } = path.node
      // const ID = 'value';
      if (parentPath.isVariableDeclarator() && parentPath.get('id') === path) {}
      // { Tabs: 'value' }
      else if (parentPath.isLabeledStatement() && parentPath.get('label') === path) {}
      // ref.ID
      else if (
        parentPath.isMemberExpression()
        && parentPath.get('property') === path
        && parentPath.node.computed === false
      ) {}
      // class A { ID() {} }
      else if (
        (parentPath.isClassProperty() || parentPath.isClassMethod())
        && parentPath.get('key') === path
      ) {}
      else {
        // used
        if (runtimeData[name]) {
          delete runtimeData[name]
        }
      }
    }
  }
  
  const importTraverseObject = {
    ImportDeclaration(path, data) {
      const { opts = {}, runtimeData } = data  
      path.skip()

      const locals = getSpecImport(path, { withPath: true, ignore: opts.ignore });
      if (locals) {
        locals.forEach((pathData, index, all) => {
          const {name} = pathData
          // already existed
          if (runtimeData[name]) {
            warn('the declare of ', `\`${name}\``, 'is already existed')
            return
          }

          runtimeData[name] = {
            parent: path,
            children: all,
            data: pathData
          }
        })
  
      }
    },
    ...idTraverseObject
  }

  function handleRemovePath(runtimeData, opts = {}) {
    const { verbose = false } = opts
    /*
     {
     parent: path,
     children: [ { path, name } ],
     data: { path, name }
     }
     */

    const allNames = Object.keys(runtimeData)
    verbose && console.log('unused-import-list', allNames)
    allNames.forEach(name => {
      const {children, data, parent} = runtimeData[name]
      const childNames = children.map(x => x.name)
      // every imported identifier is unused
      if (childNames.every(cName => allNames.includes(cName))) {
        !parent.__removed && parent.remove();
        parent.__removed = true
      }
      else {
        const path = data.path
        !path.__removed && path.remove();
        path.__removed = true
      }
    })
  
  }

  function handleAdd (file, runtimeData, opts = {}) {    
    // addDefault(file.path, 'source', { nameHint: "hintedName" })
    const prefix = 'antd/lib/';
    const allNames = Object.keys(runtimeData);
    // addDefault(file.path, 'source', { nameHint: "hintedName" })
    allNames.forEach(name => {
      const sourcePath = prefix + name;
      addDefault(file.path, sourcePath, { nameHint: "_lib_" + name })
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

        // handleRemovePath(this.runtimeData, data.opts)
        handleAdd(data.file, this.runtimeData, data.opts);
      }
      // ArrayExpression: function(path) {
      //   path.replaceWith(
      //     t.callExpression(
      //       moriMethod('vector'),
      //       path.node.elements
      //     )
      //   );
      // },
      // ObjectExpression: function(path) {
      //   var props = [];
      //   path.node.properties.forEach(function(prop) {
      //     props.push(
      //       t.stringLiteral(prop.key.name),
      //       prop.value
      //     );
      //   });

      //   path.replaceWith(
      //     t.callExpression(
      //       moriMethod('hashMap'),
      //       props
      //     )
      //   );
      // },
      // AssignmentExpression: function(path) {
      //   var lhs = path.node.left;
      //   var rhs = path.node.right;

      //   if(t.isMemberExpression(lhs)) {
      //     if(t.isIdentifier(lhs.property)) {
      //       lhs.property = t.stringLiteral(lhs.property.name);
      //     }

      //     path.replaceWith(
      //       t.callExpression(
      //         moriMethod('assoc'),
      //         [lhs.object, lhs.property, rhs]
      //       )
      //     );
      //   }
      // },
      // MemberExpression: function(path) {
      //   if(path.node.isClean) return;
      //   if(t.isAssignmentExpression(path.parent)) return;
      //   if(t.isIdentifier(path.node.property)) {
      //     path.node.property = t.stringLiteral(path.node.property.name);
      //   }
      
      //   path.replaceWith(
      //     t.callExpression(
      //       moriMethod('get'),
      //       [path.node.object, path.node.property]
      //     )
      //   );
      // },
      // ImportDeclaration: function(path) {
      //   var source = '';
      //   var target = [];
      //   var sourceNode = path.node.source;
      //   var specifiersNode = path.node.specifiers;
      //   if (t.isStringLiteral(sourceNode)) {
      //     source = sourceNode.value;
      //   }

      //   if (Array.isArray(specifiersNode)) {
      //     specifiersNode.forEach((item) => {
      //       if (t.isImportSpecifier(item)) {
      //         target.push(item.local.name);
      //       }
      //     })
      //   }

      //   var batchRequire = target.map((targetPath) => {
      //     let prefix = 'antd/lib/';
      //     debugger;
      //     return t.callExpression(t.identifier('require'), prefix + targetPath);
      //   });

      //   debugger;

      //   path.replaceWithMultiple(batchRequire);
      //   console.log(source, target);
      // }
    },
    post() {
      delete this.runtimeData
      delete this.fileData;
    }    
  };
};
