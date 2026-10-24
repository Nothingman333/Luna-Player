Upstream: https://github.com/johnfactotum/foliate-js
Revision: 78914aef4466eb960965702401634c2cb348e9b1
License: MIT (LICENSE). Bundled zip.js and fflate retain their upstream license notices.

Windows/WebView2 adaptation: iframe sandbox excludes allow-scripts, including in development. PDF continues through Luna existing PDF.js implementation; Foliate PDF dynamic import is disabled to avoid bundling a second PDF engine. Reader UI and Readest sources were not imported.
