const fs=require('fs');
const path=require('path');
const parser=require('@babel/parser');
const options=require('./webpack.config');
const traverse=require('@babel/traverse').default;
const {transformFromAst}=require('@babel/core');

const Parser={
    //2、解析入口文件，获取AST
    getAst:path=>{
        //读取入口文件
        const content=fs.readFileSync(path,'utf-8')
        //将文件内容转为AST抽象语法树
        return parser.parse(content,{
            sourceType:'module'
        })
    },
    //3、找到所有的依赖模块
    getDependecies:(ast,filename)=>{
        const dependecies={};
        // 遍历所有的 import 模块,存入dependecies
        traverse(ast,{
            ImportDeclaration({node}){
                const dirname=path.dirname(filename)
                const filepath='./'+path.join(dirname,node.source.value);
                dependecies[node.source.value]=filepath;
            }
        })
        return dependecies;
    },
    //4、AST转换成code
    getCode:ast=>{
        const{code}=transformFromAst(ast,null,{
            presets:['@babel/preset-env']
        })
        return code
    }
}

//1、定义一个compiler类
class Compiler{
    constructor(options){
        const {entry,output}=options;
        //入口
        this.entry=entry;
        //出口
        this.output=output;
        // 模块
        this.modules=[];
    }

    //构建启动
    run(){
        //5、递归解析所有依赖项，生成依赖关系图
        const info=this.build(this.entry);
        this.modules.push(info);
        this.modules.forEach(({dependecies})=>{
            //判断有依赖对象，递归解析所有依赖项
            if(dependecies){
                for(const dependecy in dependecies){
                    this.modules.push(this.build(dependecies[dependecy]))
                }
            }
        })
        const dependecyGraph=this.modules.reduce(
            (graph,item)=>({
                ...graph,
                [item.filename]:{
                    dependecies:item.dependecies,
                    code:item.code
                }
            }),
            {}
        )
    }
    build(){
        const {getAst,getDependecies,getCode}=Parser;
        const ast=getAst(this.entry);
        const dependecies=getDependecies(ast,this.entry);
        const code=getCode(ast);
        return {
            filename,
            dependecies,
            code
        }
    } 
    //6、重写require函数，输出bundle
    generate(){
        const filepath=path.join(this.output.path,this.output.filename)
        const bundle=`(function(graph){
            function require(moudle){
                function localRequire(relativePath){
                    return require(graph[module],dependecies[relativePath])
                }
                var exports={};
                (function(require,exports,code){
                    eval(code)
                })(localRequire,exports,graph[module].code);
                return exports;
            }
            require('${this.entry}')
        })(${JSON.stringify(code)})`

        fs.writeFileSync(filepath,bundle,'utf-8')
    }
}