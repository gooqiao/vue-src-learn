class Vue {
    constructor(options) {
        this.$el = options.el
        this.$data = options.data
        if (this.$el) {
            // 数据劫持
            new Observer(this.$data)
            // 编译
            new Compile(this.$el, this)
            // 代理
            this.proxyData(this.$data)
        }
    }

    proxyData(data) {
        Object.keys(data).forEach(key => {
            Object.defineProperty(this, key, {
                get() {
                    return data[key]
                },
                set(newVal) {
                    data[key] = newVal
                }
            })
        })
    }
}

class Observer {
    constructor(data) {
        this.observe(data)
    }
    observe(data) {
        if (!data || typeof data !== 'object') {
            return;
        }
        Object.keys(data).forEach(key => {
            this.defineRective(data, key, data[key]);
            this.observe(data[key]); // 深度劫持
        })
    }
    defineRective(obj, key, value) {
        let that = this;
        let dep = new Dep();
        Object.defineProperty(obj, key, {
            enumerable: true,
            configurable: true,
            // 经测试:在get发生时就执行，并不一定是在语句结尾。
            // 例如:a.b.c    b的get钩子在最后一个点的时候就会执行
            get() {
                // Dep.target是watcher与observer的唯一联系。
                // console.log(Dep.target&&Dep.target.cb,33333);

                Dep.target && dep.addSub(Dep.target);
                return value;
            },
            set(newVal) {
                if (newVal !== value) {
                    value = newVal
                    that.observe(newVal) // 
                    dep.notify() // 执行update
                }
            }
        })
    }
}

class Compile {
    constructor(el, vm) {
        this.el = this.isElementNode(el) ? el : document.querySelector(el)
        this.vm = vm
        if (this.el) {
            // 装入fragment
            let fragment = this.node2fragment(this.el)
            // 编译
            this.compile(fragment)
            // 插入到页面
            this.el.appendChild(fragment)
        }
    }

    isElementNode(node) {
        return node.nodeType === 1
    }

    node2fragment(el) {
        let fragment = document.createDocumentFragment();
        let firstChild;
        while (firstChild = el.firstChild) {
            fragment.appendChild(firstChild)
        }
        return fragment
    }

    compile(fragment) {
        let childNodes = fragment.childNodes
        Array.from(childNodes).forEach(node => {
            if (this.isElementNode(node)) {
                this.compileElement(node)
                this.compile(node) // 一级一级往下编译
            } else {
                this.compileText(node)
            }
        })
    }

    isDirective(name) {
        return name.includes('v-')
    }

    compileElement(node) {
        let attrs = node.attributes;
        Array.from(attrs).forEach(attr => {
            let attrName = attr.name;
            if (this.isDirective(attrName)) {
                let expr = attr.value
                let [, type] = attrName.split('-')
                compileUtil[type](node, this.vm, expr)
            }
        })
    }

    compileText(node) {
        let expr = node.textContent;
        let reg = /\{\{([^}]+)\}/g
        if (reg.test(expr)) {
            compileUtil['text'](node, this.vm, expr)
        }
    }

}

class Dep {
    constructor() {
        this.subs = [];
    }
    addSub(watcher) {
        this.subs.push(watcher)
    }
    notify() {
        this.subs.forEach(watcher => {
            watcher.update()
        })
    }
}

class Watcher {
    constructor(vm, expr, cb) {
        this.vm = vm
        this.expr = expr
        this.cb = cb
        this.update()
        this.value = this.get()
    }
    get() {
        Dep.target = this
        let value = this.getVal(this.vm, this.expr)
        Dep.target = null
        return value
    }
    getVal(vm, expr) {
        expr = expr.split('.');
        return expr.reduce((prev, next) => {
            return prev[next];
        }, vm.$data)
    }
    update() {
        let newVal = this.getVal(this.vm, this.expr)
        let oldVal = this.value
        if (newVal !== oldVal) {
            this.cb(newVal)
        }
    }
}

let compileUtil = {

    textReg: /\{\{([^}]+)\}\}/g,
    // 文本处理
    text(node, vm, expr) {
        // 
        let exprVal = this.parsingExpr(expr)[1]
        new Watcher(vm, exprVal, (newVal) => {
            this.updateTextFn(node, newVal)
        })
    },
    // 解析表达式
    parsingExpr(expr) {
        return expr.replace(this.textReg, (...arguments) => {
            return arguments
        }).split(',')
    },
    // 逐级取值
    reduceExprVal(vm, expr, reduceFn) {
        expr = expr.split('.');
        return expr.reduce(reduceFn, vm.$data)
    },

    setVal(vm, expr, value) {
        // 根据表达式，按.号依次向下取值，直至最后一个变量。然后设置最后的值。
        // 第二个参数vm.$data作为初始数据填充进表达式
        let exprTemp = expr.split('.')
        return this.reduceExprVal(vm, expr, (prev, next, currentIndex) => {
            if (currentIndex === exprTemp.length - 1) {
                return prev[next] = value;
            }
            return prev[next];
        })
    },

    model(node, vm, expr) {
        // 监控数据变化
        new Watcher(vm, expr, (newVal) => {
            this.updateModelFn(node, newVal)
        })
        node.addEventListener('input', (e) => {
            let newVal = e.target.value;
            this.setVal(vm, expr, newVal);
        })
    },

    updateModelFn(node, val) {
        let updateFn = this.updater['updaterModel'];
        updateFn && updateFn(node, val)
    },
    updateTextFn(node, val) {
        let updateFn = this.updater['updaterText'];
        updateFn && updateFn(node, val)
    },

    updater: {
        updaterText(node, value) {
            node.textContent = value;
        },
        updaterModel(node, value) {
            node.value = value;
        }
    }
}