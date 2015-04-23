import angular from 'angular-fix';

export default formlyForm;

/**
 * @ngdoc directive
 * @name formlyForm
 * @restrict E
 */
// @ngInject
function formlyForm(formlyUsability, $parse, formlyApiCheck, formlyConfig) {
  var currentFormId = 1;
  var optionsApi = [
    formlyApiCheck.shape({
      formState: formlyApiCheck.object.optional,
      resetModel: formlyApiCheck.func.optional,
      updateInitialValue: formlyApiCheck.func.optional,
      removeChromeAutoComplete: formlyApiCheck.bool.optional
    }).strict.optional
  ];
  return {
    restrict: 'E',
    template: function formlyFormGetTemplate(el, attrs) {
      /* jshint -W033 */ // this because jshint is broken I guess...
      const rootEl = attrs.rootEl || 'ng-form';
      const formId = `formly_${currentFormId++}`;
      let formName = formId;
      const bindName = attrs.bindName;
      if (bindName) {
        if (angular.version.minor < 3) {
          throw formlyUsability.getFormlyError('bind-name attribute on formly-form not allowed in > angular 1.3');
        }
        formName = `{{::'formly_' + ${bindName}}}`;
      }
      return `
        <${rootEl} class="formly"
                 name="${formName}"
                 role="form">
          <div formly-field
               ng-repeat="field in fields track by $index"
               ng-if="!field.hide"
               class="formly-field {{field.type ? 'formly-field-' + field.type : ''}}"
               options="field"
               model="field.model || model"
               fields="fields"
               form="${formId}"
               form-id="${formId}"
               form-state="options.formState"
               index="$index">
          </div>
          <div ng-transclude></div>
        </${rootEl}>
      `;
    },
    replace: true,
    transclude: true,
    scope: {
      fields: '=',
      model: '=',
      form: '=?',
      options: '=?'
    },
    controller: /* @ngInject */ function FormlyFormController($scope, formlyUtil) {
      setupOptions();
      const fakeScopesForHiddenFields = {};
      $scope.model = $scope.model || {};
      $scope.fields = $scope.fields || [];

      angular.forEach($scope.fields, attachKey); // attaches a key based on the index if a key isn't specified
      angular.forEach($scope.fields, setupWatchers); // setup watchers for all fields

      // watch the model and evaluate watch expressions that depend on it.
      $scope.$watch('model', function onResultUpdate(newResult) {
        angular.forEach($scope.fields, function runFieldExpressionProperties(field, index) {
          /*jshint -W030 */

          // This is simpler than it looks. The only time the complex stuff gets run is if the field doesn't get
          // runExpressions set on it :-(

          if (field.runExpressions) {
            field.runExpressions(newResult);
          } else if (field.expressionProperties) {
            console.log('hey');
            const id = formlyUtil.getFieldId($scope.formId, field, index);
            fakeScopesForHiddenFields[id] = fakeScopesForHiddenFields[id] || createFakeScope(field, index, id);
            const scope = fakeScopesForHiddenFields[id];
            const currentValue = scope.model[field.key];
            angular.forEach(
              field.expressionProperties, function(exp, prop) {
                console.log(exp, prop);
                formlyUtil.runExpression.bind(null, scope, currentValue, field)(exp, prop);
              }
            );
          }
        });
      }, true);

      /**
       * When a field is hidden, it has no scope to evaluate run expressions on.
       * @param field
       * @param index
       * @param id
       * @returns {*|Object}
       */
      function createFakeScope(field, index, id) {
        const fakeScope = $scope.$new();
        angular.extend(fakeScope, {
          options: field,
          model: field.model || $scope.model,
          formId: $scope.formId,
          index,
          fields: $scope.fields,
          formState: $scope.options.formState,
          form: $scope[$scope.formId],
          id,
          to: field.templateOptions,
          fc: {}
        });
        return fakeScope;
      }

      function setupOptions() {
        formlyApiCheck.throw(optionsApi, [$scope.options], {prefix: 'formly-form options check'});
        $scope.options = $scope.options || {};
        $scope.options.formState = $scope.options.formState || {};

        angular.extend($scope.options, {
          updateInitialValue,
          resetModel
        });

      }

      function updateInitialValue() {
        angular.forEach($scope.fields, field => field.updateInitialValue());
      }

      function resetModel() {
        angular.forEach($scope.fields, field => field.resetModel());
      }

      function attachKey(field, index) {
        field.key = field.key || index || 0;
      }

      function setupWatchers(field, index) {
        if (!angular.isDefined(field.watcher)) {
          return;
        }
        var watchers = field.watcher;
        if (!angular.isArray(watchers)) {
          watchers = [watchers];
        }
        angular.forEach(watchers, function setupWatcher(watcher) {
          if (!angular.isDefined(watcher.listener)) {
            throw formlyUsability.getFieldError(
              'all-field-watchers-must-have-a-listener',
              'All field watchers must have a listener', field
            );
          }
          var watchExpression = getWatchExpression(watcher, field, index);
          var watchListener = getWatchListener(watcher, field, index);

          var type = watcher.type || '$watch';
          watcher.stopWatching = $scope[type](watchExpression, watchListener, watcher.watchDeep);
        });
      }

      function getWatchExpression(watcher, field, index) {
        var watchExpression = watcher.expression || `model['${field.key}']`;
        if (angular.isFunction(watchExpression)) {
          // wrap the field's watch expression so we can call it with the field as the first arg
          // and the stop function as the last arg as a helper
          var originalExpression = watchExpression;
          watchExpression = function formlyWatchExpression() {
            var args = modifyArgs(watcher, index, ...arguments);
            return originalExpression(...args);
          };
          watchExpression.displayName = `Formly Watch Expression for field for ${field.key}`;
        }
        return watchExpression;
      }

      function getWatchListener(watcher, field, index) {
        var watchListener = watcher.listener;
        if (angular.isFunction(watchListener)) {
          // wrap the field's watch listener so we can call it with the field as the first arg
          // and the stop function as the last arg as a helper
          var originalListener = watchListener;
          watchListener = function formlyWatchListener() {
            var args = modifyArgs(watcher, index, ...arguments);
            return originalListener(...args);
          };
          watchListener.displayName = `Formly Watch Listener for field for ${field.key}`;
        }
        return watchListener;
      }

      function modifyArgs(watcher, index, ...originalArgs) {
        return [$scope.fields[index], ...originalArgs, watcher.stopWatching];
      }
    },
    link(scope, el, attrs) {
      scope.formId = attrs.name;
      if (attrs.form) {
        $parse(attrs.form).assign(scope.$parent, scope[scope.formId]);
      }

      // chrome autocomplete lameness
      // see https://code.google.com/p/chromium/issues/detail?id=468153#c14
      // ლ(ಠ益ಠლ)   (╯°□°)╯︵ ┻━┻    (◞‸◟；)
      const global = formlyConfig.extras.removeChromeAutoComplete === true;
      const offInstance = scope.options && scope.options.removeChromeAutoComplete === false;
      const onInstance = scope.options && scope.options.removeChromeAutoComplete === true;
      if ((global && !offInstance) || onInstance) {
        const input = document.createElement('input');
        input.setAttribute('autocomplete', 'address-level4');
        input.setAttribute('hidden', true);
        el[0].appendChild(input);
      }
    }
  };
}
