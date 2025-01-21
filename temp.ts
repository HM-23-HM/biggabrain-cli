import { readFileSync } from "fs";
import { extractAndSaveJsonStrings, extractValidJsonStringsFromFile, processQuestionFile } from "./src/utils/parse";
import { parseKatex } from "./src/utils/marketing";

const temp = `1.  Completely factor the expression [tex]\\huge{15a^2 - 5ab}[/tex].\n' +
    '2. (i) Show that [tex]\\huge{\\frac{y}{1-y} - 2y = \\frac{2y - 1}{1 - y}}[/tex].\n' +
    '   (ii) Hence, solve the equation [tex]\\huge{\\frac{y}{1-y} - 2y = 0}[/tex].\n' +
    '3. Make [tex]\\huge{w}[/tex] the subject of the formula [tex]\\huge{q = \\sqrt{3} + w}[/tex].\n' +
    '4. (i) Shape A is _______ to Shape B.\n' +
    '(ii) Give the reason for your choice in (4)(i).`

const temp1 = `1.  Completely factor the expression [tex]\\huge{15a^2 - 5ab}[/tex].\n`
const temp1_1 = `<h3>1.  Completely factor the expression [tex]\huge{15a^2 - 5ab}[/tex].</h3>`
const temp2 = `2. (i) Show that [tex]\\huge{\\frac{y}{1-y} - 2y = \\frac{2y - 1}{1 - y}}[/tex].\n`
const temp3 = `3. Make [tex]\\huge{w}[/tex] the subject of the formula [tex]\\huge{q = \\sqrt{3} + w}[/tex].\n`
const temp4 = `4. (i) Shape A is _______ to Shape B.\n`
const temp5 = `(ii) Give the reason for your choice in (4)(i).`

const p1 = parseKatex(temp1);
const p1_1 = parseKatex(temp1_1);
const p2 = parseKatex(temp2);
const p3 = parseKatex(temp3);
const p4 = parseKatex(temp4);
const p5 = parseKatex(temp5);
console.log({ p1, p1_1 })
