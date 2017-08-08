'use strict';

+function() {
	var validTags = [
		'b', 'i', 'u', 'ul', 'ol', 'li', 'pre', 'strike', 'sub', 'sup',
		'span', 'span\\s+style\\s*=\\s*(&quot;|&apos;)(?:(?!\\1).)*\\1', // <span style="...">
		'div', 'div\\s+style\\s*=\\s*(&quot;|&apos;)(?:(?!\\1).)*\\1', // <div style="...">
		'hr\\s*/?', // <hr/>
		'br\\s*/?', // <br/>
		'font', 'font\\s+color\\s*=\\s*(&quot;|&apos;)(?:(?!\\1).)*\\1' // <font color="red">
	].map(function(tag) {
		return new RegExp('&lt;/?' + tag + '&gt;', 'ig');
	});

	String.prototype.escapeHTML = function(keepFormatting) {
		var output = he.encode(this, { useNamedReferences : true });

		if (keepFormatting) {
			for (var i = 0; i < validTags.length; i++) {
				var reTag = validTags[i], match;
				while (match = reTag.exec(output)) {
					var tag = match[0];
					tag = '<' + tag.slice(4, tag.length-4).replace(/&quot;/g, '"').replace(/&apos;/g, "'") + '>';
					output = output.slice(0, match.index) + tag + output.slice(match.index + match[0].length);
					reTag.lastIndex -= match[0].length - tag.length;
				}
			}
		}

		return output.replace(/&amp;(\w+);/g, function($0, $1) { return '&'+$1+';'; });
	};
}();

function Question(type, title, text, options) {
	this.type = type || 'short';
	this.title = title || '';
	this.text = text || '';
	this.options = options || (options = []);

	var self = this;
	this.remove = function() {
		vm.questions.splice(vm.questions.indexOf(self), 1);
	};

	this.addOption = function() {
		options.push(new Option(self));
	};

	Object.defineProperties(this, {
		showOptions : {
			get : function() {
				return this.type === 'multi' || this.type === 'single';
			}
		},
		showInstructions : {
			get : function() {
				return this.type === 'dehnadi';
			}
		}
	});
}
Question.prototype.toString = function() {
	var out = '';
	if (this.title) out += '::' + this.title + '::\n';
	if (this.text) out += '[html]' + this.text.escapeHTML(true) + '\n';
	switch (this.type) {
		case 'short':
			return out + '{}'; // TODO
		case 'long':
			return out + '{}';
		case 'multi':
			return out + multiOptions(this.options);
		case 'single':
			return out + singleOptions(this.options);
		case 'dehnadi':
			return out + dehnadiCode(this.options) + dehnadiOptions(this.options);
	}
};

function multiOptions(options) {
	var total = options.map(function(opt) { return opt.value; })
			.reduce(function(sum, val) { return sum + val; });
	var empty = options.reduce(function(empty, opt) { return empty + (opt.value?0:1); }, 0);

	var defaultValue = -100 / empty;

	return '{\n' + options.map(function(opt) {
		var value = opt.value ? opt.value / total * 100 : defaultValue;
		return '\t~%' + value.toFixed(5) + '%' + opt.text.replace(/([~=#{}])/g, '\\$1').escapeHTML(true);
	}).join('\n') + '\n}';
}
function singleOptions(options) {
	var max = options.map(function(opt) { return opt.value; })
			.reduce(function(max, val) { if (val > max) return val; else return max; });

	return '{\n' + options.map(function(opt) {
		var text = opt.text.replace(/([~=#{}])/g, '\\$1').escapeHTML(true);
		if (opt.value === max) return '\t=' + text;
		if (opt.value) return '\t~%' + (opt.value / max * 100).toFixed(5) + '%' + text;
		return '\t~' + text;
	}).join('\n') + '\n}';
}
function dehnadiCode(instructions) {
	return '<pre>\n\t' + instructions.map(instr => instr.text).join('\n\t') + '\n</pre>';
}
function DehnadiInterpreter(instructions) {
	var ctx = [ {} ], declaring = false;
	instructions = instructions.map(this.parse);

	var firstAssignment = instructions.findIndex(instr => instr.type==='assign');
	if (firstAssignment < 0) throw new Error('No assignments found.');

	var declarations = instructions.slice(0, firstAssignment);
	var assignments = instructions.slice(firstAssignment);
	if (assignments.find(instr => instr.type==='declare')) throw new Error('Misplaced declaration.');

	var ctx = declarations.reduce(
		(ctx, decl) => (ctx[decl.left] = decl.right, ctx),
		{});
	
	var results = DehnadiInterpreter.assignmentRules
		.map(assignmentRule => {
			if (assignments.length === 1) {
				var cout = Object.create(ctx), assignment = assignments[0]
				assignmentRule(ctx, cout, assignment.left, assignment.right);
				cout.__code = assignmentRule.code;
				return [ cout ];
			}

			return DehnadiInterpreter.compositionRules.map(compositionRule => {
				var cout = compositionRule(Object.create(ctx), assignmentRule, assignments);
				cout.__code = assignmentRule.code + '+' + compositionRule.code;
				return cout;
			});
		})
		.reduce((list, out) => list.concat(out), []);

	var variables = declarations.map(decl => decl.left)
				.reduce((vars, v) => ~vars.indexOf(v) ? vars : vars.concat(v), []); // remove duplicates
	this.options = results.map(result => {
			var vars = variables.map(v => [ v, result[v] ]);
			vars.__code = [result.__code ];
			return vars;
		})
		.reduce((options, result) => { // merge duplicates
			function sameResult(option) {
				for (var i = 0; i < option.length; i++) {
					var vOpt = option[i], vRes = result[i];
					if (vOpt[1] !== vRes[1]) return false;
				}
				return true;
			}

			var alreadyThere = options.find(sameResult);
			if (alreadyThere) {
				alreadyThere.__code.push(result.__code[0]);
			} else {
				options.push(result);
			}

			return options;
		}, [])
		.map(option => ({
			text : option.map(v => `${v[0]}=${v[1]}`).join('   4   8'.replace(/./g, '&nbsp;')),
			comment : option.__code.join(' / ')
		}));
}
DehnadiInterpreter.prototype.parse = function(instruction) {
	var check;
	if (check = /^\s*int\s+([_a-zA-Z]\w*)\s*=\s*(\d+)\s*;?\s*$/.exec(instruction)) {
		return { type : 'declare', left : check[1], right : +check[2] };
	}
	if (check = /^\s*([_a-zA-Z]\w*)\s*=\s*([_a-zA-Z]\w*|\d+)\s*;?\s*$/.exec(instruction)) {
		var value = +check[2];
		if (isNaN(value)) {
			return { type : 'assign', left : check[1], right : check[2] };
		} else {
			return { type : 'declare', left : check[1], right : value };
		}
	}
	throw instruction;
};
DehnadiInterpreter.assignmentRules = [
	Rule('M1', 'right-to-left move', function(cin, cout, a, b) {
		cout[a] = cin[b];
		cout[b] = 0;
	}),
	Rule('M2', 'right-to-left copy', function(cin, cout, a, b) {
		cout[a] = cin[b];
	}),
	Rule('M3', 'left-to-right move', function(cin, cout, a, b) {
		cout[b] = cin[a];
		cout[a] = 0;
	}),
	Rule('M4', 'left-to-right copy', function(cin, cout, a, b) {
		cout[b] = cin[a];
	}),
	Rule('M5', 'right-to-left copy-and-add', function(cin, cout, a, b) {
		cout[a] = cin[a] + cin[b];
	}),
	Rule('M6', 'right-to-left move-and-add', function(cin, cout, a, b) {
		cout[a] = cin[a] + cin[b];
		cout[b] = 0;
	}),
	Rule('M7', 'left-to-right copy-and-add', function(cin, cout, a, b) {
		cout[b] = cin[b] + cin[a];
	}),
	Rule('M8', 'left-to-right move-and-add', function(cin, cout, a, b) {
		cout[b] = cin[b] + cin[a];
		cout[a] = 0;
	}),
	Rule('M9', 'no change', function(cin, cout, a, b) {
	}),
	Rule('M10', 'equality', function(cin, cout, a, b) {
		// ???
	}),
	Rule('M11', 'swap', function(cin, cout, a, b) {
		cout[a] = cin[b];
		cout[b] = cin[a];
	})
];
DehnadiInterpreter.assignmentRule = function(code) {
	return this.assignmentRules.find(function(rule) {
		return rule.code === code;
	});
};
DehnadiInterpreter.moveRules = {
	M1 : DehnadiInterpreter.assignmentRule('M2'),
	M3 : DehnadiInterpreter.assignmentRule('M4'),
	M6 : DehnadiInterpreter.assignmentRule('M5'),
	M8 : DehnadiInterpreter.assignmentRule('M7')
};
DehnadiInterpreter.compositionRules = [
	Rule('S1', 'sequential', function(ctx, rule, instructions) {
		return instructions.reduce(function(cin, instr) {
			var cout = Object.create(cin);
			rule(cin, cout, instr.left, instr.right);
			return cout;
		}, ctx);
	}),
	Rule('S2', 'parallel', function(cin, rule, instructions) {
		var cout = Object.create(cin);
		instructions.forEach(function(instr) {
			rule(cin, cout, instr.left, instr.right);
		});
		return cout;
	}),
	Rule('S3', 'parallel destination-only', function(cin, rule, instructions) {
		var cout = Object.create(cin);
		if (rule.code in DehnadiInterpreter.moveRules) {
			rule = DehnadiInterpreter.moveRules[rule.code];
		}
		instructions.forEach(function(instr) {
			rule(cin, cout, instr.left, instr.right);
		});
		return cout;
	})
];

function Rule(code, description, fn) {
	fn.code = code;
	fn.description = description;
	return fn;
}

function dehnadiOptions(instructions) {
	instructions = instructions.map(function(instr) { return instr.text; });
	return '{\n\t' + new DehnadiInterpreter(instructions).options.map(opt => {
		var out = '// ' + opt.comment + '\n\t';
		if (/M2(\+S1)?(\s|$)/.test(opt.comment)) out += '=';
		else out += '~';
		return out + opt.text.replace(/([~=#{}])/g, '\\$1')
	}).join('\n\t') + '\n}';
}

function Option(question, value, text) {
	this.value = value || 0;
	this.text = text || "";

	Object.defineProperties(this, {
		valid : {
			get : function() {
				return !isNaN(this.value);
			}
		}
	});

	var self = this;
	this.remove = function() {
		question.options.splice(question.options.indexOf(self), 1);
	};
}

function QuestionType(type, text) {
	this.type = type;
	this.text = text;
}

var vm = new Vue({
	el : '#app',
	data : {
		questions : [],
		questionTypes : [
			new QuestionType("short", "Short text"),
			new QuestionType("long", "Long text"),
			new QuestionType("multi", "Multiple choice, multiple response"),
			new QuestionType("single", "Multiple choice, single response"),
			new QuestionType("dehnadi", "Dehnadi test")
		]
	},
	methods : {
		addQuestion : function() {
			this.questions.push(new Question());
		},
		build : function() {
			var gift = this.questions.map(function(question) {
				return question.toString();
			})
			.join('\n\n');

			// download
			var dl = document.createElement('a');
			dl.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(gift);
			dl.download = 'export.gift';

			if (document.createElement) {
				var event = document.createEvent('MouseEvents');
				event.initEvent('click', true, true);
				dl.dispatchEvent(event);
			} else {
				dl.click();
			}
		}
	}
});
