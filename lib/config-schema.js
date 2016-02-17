'use babel'

export default {
  formatTool: {
    title: 'Format Tool',
    description: 'The default format tool.',
    type: 'string',
    default: 'goimports',
    enum: ['goimports', 'goreturns', 'gofmt'],
    order: 10
  },

  formatOnSave: {
    title: 'Format On Save',
    description: 'Automatically run the format tool when a go file is saved.',
    type: 'boolean',
    default: true,
    order: 20
  }
}
