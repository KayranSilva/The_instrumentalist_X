// Carrega os scripts compilados (sem módulos) num contexto isolado do Node
// e devolve as funções globais que os testes usam.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(names, exportsExpression) {
  const context = vm.createContext({ setTimeout });
  names.forEach((name) => {
    const file = path.join(__dirname, "..", "FrontEnd", `${name}.js`);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  });
  return vm.runInContext(`(${exportsExpression})`, context);
}

module.exports = { load };
