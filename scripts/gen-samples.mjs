// Writes test CSVs into samples/: encodings, delimiters, quoting, and a large file.
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs'

mkdirSync('samples', { recursive: true })
const people = 'id,name,city\n1,José Núñez,Málaga\n2,Ana,Cañete\n3,Mariana,Zürich\n'

writeFileSync('samples/utf8.csv', people)
writeFileSync('samples/utf8-bom.csv', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(people)]))
// Windows-1252: é=E9 ñ=F1 á=E1 ü=FC ç=E7
writeFileSync('samples/windows-1252.csv', Buffer.from(people.replace(/[^\x00-\x7f]/g, (c) => ({ é: '\xe9', ñ: '\xf1', á: '\xe1', ü: '\xfc', ç: '\xe7', ú: '\xfa' })[c] ?? '?'), 'latin1'))
writeFileSync('samples/semicolon.csv', 'id;name;price\r\n1;Widget;"1,50"\r\n2;Gadget;"2,25"\r\n')
writeFileSync('samples/tricky.csv', 'id,note,quote\n1,"has, comma","say ""hi"""\n2,"two\nlines",plain\n3,,"""start"\n4,short\n')

const rows = 200_000
const out = createWriteStream('samples/large.csv')
out.write('id,name,city,notes\n')
for (let i = 1; i <= rows; i++) out.write(`${i},Person ${i},City ${i % 500},"note ${i}, with comma"\n`)
out.end()
