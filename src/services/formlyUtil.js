import utils from '../other/utils';
import angular from 'angular-fix';

export default formlyUtil;

// @ngInject
function formlyUtil($parse, $q) {
  return angular.extend({runExpression}, utils);

  function runExpression($scope, currentValue, field, expression, prop) {
    var setter = $parse(prop).assign;
    var promise = $q.when(utils.formlyEval($scope, expression, currentValue));
    return promise.then(function setFieldValue(value) {
      return setter(field, value);
    });
  }
}
