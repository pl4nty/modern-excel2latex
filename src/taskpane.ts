/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/* global console, document, Excel, Office, MathJax, OfficeExtension, window*/

Office.onReady(info => {
  if (info.host === Office.HostType.Excel) {
    document.getElementById("error-body").style.display = "none";
    document.getElementById("copy").onclick = copy;

    // Rerender LaTeX preview on content change
    const node = document.getElementById("preview");
    const observer = new window.MutationObserver(() => {
      MathJax.Hub.Queue(["Typeset",MathJax.Hub,"preview"]);
      MathJax.Hub.Queue(function () {
        document.getElementById("app-body").style.display = "flex";
      });
      // use MathJax.typesetPromise() with MathJax v2 when @types/mathjax gets updated
    });
    observer.observe(node, {
        attributes: true,
        childList: true,
        subtree: true
    });

    Excel.run(async context => {
      // hot reload
      const range = context.workbook.getSelectedRange();
      await context.sync()
      const binding = context.workbook.bindings.add(range, "Range", "HotReload");
      binding.onDataChanged.add(run);
      await context.sync();
      
      // initial load
      run({ binding });
      await context.sync();
    }).catch(excelError);;
  }
});

function copy() {
  const node = document.getElementById("preview");
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("copy");
  selection.empty();
}

export async function run(event: Excel.BindingDataChangedEventArgs) {
  Excel.run(async context => {
    const range = event.binding.getRange();
    range.load('values'); 

    const props = range.getCellProperties({
      format: {
        font: {
          bold: true,
          color: true,
          italic: true,
          strikethrough: true,
          subscript: true,
          superscript: true,
          underline: true
        }
      }
    });

    await context.sync(); // first-time context
    await event.binding.context.sync(); // hot-reload context

    document.getElementById("preview").innerText = rangeToLatex(range, props);
  }).catch(excelError);
}

function excelError(error) {
  if (error instanceof OfficeExtension.Error) {
    switch (error.code) {
      case "InvalidSelection": displayError("Please select a single range."); break;
      default: displayError(error.message);
    }
  } else {
    displayError(error);
  }
}

function displayError(message) {
  document.getElementById("app-body").style.display = "none";
  document.getElementById("error-body").removeAttribute("style");
  document.getElementById("error-msg").innerHTML = message;
  console.error(message);
}

function rangeToLatex(range: Excel.Range, props: OfficeExtension.ClientResult<Excel.CellProperties[][]>) {
  // Convert single-row ranges (1D array) to standard 2D
  if (typeof range.values[0] === 'string') {
    range.values = [range.values];
  }

  let packages = {};
  const rows = range.values.map((row, i) => {
    return row.map((value, j) => {
      if (value === '') return '';
      value = value.toString(); // values can be strings, numbers or bools

      const formatted = applyFormat(value, props.value[i][j].format, packages);
      packages = formatted.packages;
      return formatted.value;
    }).join(' & ') + '\\\\';
  });

  return [
    ...Object.values(packages),
    `\\begin{array}{${"c".repeat(range.values[0].length)}}`,
    ...rows,
    "\\end{array}"
  ].join('\n');
}

// Only applies if format applied to entire cell, not individual letters
// TODO cell borders, alignment?
function applyFormat(value: string, format, packages) {
  if (format.font.bold) value = `\\textbf{${value}}`

  if (format.font.color !== "#000000") {
    if (!packages.color) packages.color = "\\usepackage{xcolor}";
    value = `\\textcolor{${format.font.color}}{${value}}`;
  }

  if (format.font.italic) value = `\\textit{${value}}`

  // apply font?

  // don't change font size

  if (format.font.strikethrough) {
    if (!packages.strikethrough) packages.strikethrough = "\\usepackage{cancel}";
    value = `\\cancel{${value}}`;
  }

  if (format.font.subscript) {
    if (!packages.subscript) packages.subscript = "\\usepackage{fixltx2e}";
    value = `\\textsubscript{${value}}`;
  }

  if (format.font.superscript) value = `\\textsuperscript{${value}}`

  if (format.font.underline === "Single") value = `\\underline{${value}}`

  return { value, packages };
}