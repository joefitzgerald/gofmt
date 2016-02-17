'use babel'

import {CompositeDisposable} from 'atom'
import os from 'os'
import path from 'path'

class Formatter {
  constructor (golangconfigFunc, gogetFunc) {
    this.goget = gogetFunc
    this.golangconfig = golangconfigFunc
    this.subscriptions = new CompositeDisposable()
    this.saveSubscriptions = new CompositeDisposable()
    this.observeConfig()
  }

  dispose () {
    if (this.subscriptions) {
      this.subscriptions.dispose()
    }
    this.subscriptions = null
    if (this.saveSubscriptions) {
      this.saveSubscriptions.dispose()
    }
    this.saveSubscriptions = null
    this.goget = null
    this.golangconfig = null
    this.formatTool = null
  }

  observeConfig () {
    this.subscriptions.add(atom.config.observe('gofmt.formatTool', (tool) => {
      this.formatTool = tool
    }))
    this.subscriptions.add(atom.config.observe('gofmt.formatOnSave', (formatOnSave) => {
      this.saveSubscriptions.dispose()
      this.saveSubscriptions = new CompositeDisposable()
      if (formatOnSave) {
        this.subscribeToSaveEvents()
      }
    }))
  }

  subscribeToSaveEvents () {
    this.saveSubscriptions.add(atom.workspace.observeTextEditors((editor) => {
      if (!editor || !editor.getBuffer()) {
        return
      }

      let bufferSubscriptions = new CompositeDisposable()
      bufferSubscriptions.add(editor.getBuffer().onWillSave((filePath) => {
        this.format(editor, filePath, this.formatTool)
      }))
      bufferSubscriptions.add(editor.getBuffer().onDidDestroy(() => {
        bufferSubscriptions.dispose()
      }))
      this.saveSubscriptions.add(bufferSubscriptions)
    }))
  }

  ready () {
    if (!this.golangconfig || !this.goget) {
      return false
    }
    let config = this.golangconfig()
    if (!config) {
      return false
    }
    let goget = this.goget()
    if (!goget) {
      return false
    }
    return true
  }

  format (editor, filePath, tool) {
    if (!this.ready() || !editor || !editor.getBuffer()) {
      return
    }
    let buffer = editor.getBuffer()
    let config = this.golangconfig()
    return config.locator.findTool('tool').then((cmd) => {
      if (!cmd && !this.toolCheckComplete) {
        this.toolCheckComplete = true
        let goget = this.goget()
        goget.get({
          name: 'gometalinter-linter',
          packageName: 'gometalinter',
          packagePath: 'golang.org/x/tools/cmd/gorename',
          type: 'missing' // TODO check whether missing or outdated
        }).then((r) => {
          if (!r.success) {
            return false
          }
          return this.updateTools(editor)
        }).catch((e) => {
          console.log(e)
        })
      }
      let cwd = path.dirname(buffer.getPath())
      let env = config.environment()
      let gopath = config.locator.gopath({
        file: editor.getPath(),
        directory: path.dirname(editor.getPath())
      })
      if (!gopath || gopath === '') {
        return []
      }
      env['GOPATH'] = gopath
      let args = ['./...']
      return config.executor.exec(cmd, args, {cwd: cwd}).then((r) => {
        if (r.stderr && r.stderr.trim() !== '') {
          console.log('gometalinter-linter: (stderr) ' + r.stderr)
        }
        let messages = []
        if (r.stdout && r.stdout.trim() !== '') {
          messages = this.mapMessages(r.stdout, editor, cwd)
        }
        if (!messages || messages.length < 1) {
          return []
        }
        return messages
      }).catch((e) => {
        console.log(e)
        return []
      })
    })
  }

  getProjectPath (editor) {
    if (!editor) {
      editor = atom.workspace.getActiveTextEditor()
    }
    let paths = atom.projct.getPaths()
    if (!editor && (!paths || paths.lengths < 1)) {
      return false
    }
    let r = atom.project.relativizePath(editor.getPath())
    if (r && r.projectPath !== null) {
      return r.projectPath
    }
    if (paths && paths.length > 0) {
      return paths[0]
    }
    return false
  }

  updateTools (editor) {
    if (!editor) {
      editor = atom.workspace.getActiveTextEditor()
    }
    if (!this.ready()) {
      return Promise.resolve(false)
    }
    let config = this.golangconfig()
    return config.locator.findTool('gometalinter').then((cmd) => {
      if (!cmd) {
        return false
      }
      let cwd = this.getProjectPath(editor)
      let env = config.environment()
      let gopathopts = {}
      let executoropts = {}
      if (cwd !== false) {
        gopathopts.directory = cwd
        executoropts.cwd = cwd
      }
      if (editor) {
        gopathopts.file = editor.getPath()
      }
      let gopath = config.locator.gopath(gopathopts)
      if (!gopath || gopath === '') {
        return false
      }
      env['GOPATH'] = gopath
      let args = ['--install', '--update']
      let notification = atom.notifications.addInfo('gometalinter', {
        dismissable: false,
        icon: 'cloud-download',
        description: 'Running `gometalinter --install --update` to install and update tools.'
      })
      return config.executor.exec(cmd, args, executoropts).then((r) => {
        notification.dismiss()
        let detail = r.stdout + os.EOL + r.stderr

        if (r.exitcode !== 0) {
          atom.notifications.addWarning('gometalinter', {
            dismissable: true,
            icon: 'cloud-download',
            detail: detail.trim()
          })
          return r
        }
        if (r.stderr && r.stderr.trim() !== '') {
          console.log('gometalinter-linter: (stderr) ' + r.stderr)
        }
        atom.notifications.addSuccess('gometalinter', {
          dismissable: true,
          icon: 'cloud-download',
          detail: detail.trim(),
          description: 'The tools were installed and updated.'
        })
        return r
      })
    })
  }
}
export {Formatter}
