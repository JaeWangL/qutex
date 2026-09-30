#!/usr/bin/env python3
"""Extract whole simple HWP5 equations and saved object metrics for local study.

This is deliberately not a general HWP equation translator. Unsupported syntax
is rejected, not repaired or approximated. Requires olefile, like inspect-hwp.py.
Source scripts, saved previews and local measurements must remain under ignored
artifacts/. No Hancom font or rendering is produced by this tool.
"""

from __future__ import annotations

import argparse
from collections import Counter
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import re
import struct
import zlib


_spec = importlib.util.spec_from_file_location('inspect_hwp', Path(__file__).with_name('inspect-hwp.py'))
hwp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hwp)


class Unsupported(ValueError):
    pass


class SimpleEquation:
    """Small expression grammar; `over` is accepted only inside explicit braces.

    Supports integer/single-letter/Greek atoms, braces, +/-, implicit products,
    sqrt{...}, and braced fractions. It does not guess text/font scope, root
    syntax, relation alignment, spacing commands, functions or over precedence.
    """

    greek = {'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda',
             'mu', 'pi', 'rho', 'sigma', 'phi', 'omega'}

    def __init__(self, source):
        if len(source) > 120:
            raise Unsupported('long expression')
        tokens = re.findall(r'[A-Za-z]+|[0-9]+|[{}+\-]|\S', source)
        self.tokens, self.i, self.features = tokens, 0, set()

    def peek(self):
        return self.tokens[self.i] if self.i < len(self.tokens) else None

    def take(self, expected=None):
        token = self.peek()
        if token is None or (expected is not None and token != expected):
            raise Unsupported('unexpected token or incomplete group')
        self.i += 1
        return token

    def expression(self):
        value = self.product()
        while self.peek() in ('+', '-'):
            op = self.take()
            value += op + self.product()
            self.features.add('arithmetic')
        return value

    def product(self):
        value = self.atom()
        while self.peek() not in (None, '}', '+', '-', 'over'):
            value += ' ' + self.atom()
            self.features.add('product')
        return value

    def atom(self):
        token = self.take()
        if token == '-':
            self.features.add('signed')
            return '-' + self.atom()
        if token == '{':
            value = self.expression()
            if self.peek() == 'over':
                self.take()
                denominator = self.expression()
                value = '\\frac{' + value + '}{' + denominator + '}'
                self.features.add('fraction')
            else:
                value = '{' + value + '}'
            self.take('}')
            return value
        if token == 'sqrt':
            if self.peek() != '{':
                raise Unsupported('sqrt without explicit radicand braces')
            self.features.add('radical')
            return '\\sqrt{' + self.atom() + '}'
        if token.isascii() and token.isdecimal():
            return token
        if len(token) == 1 and token.isascii() and token.isalpha():
            return token
        if token in self.greek:
            return '\\' + token
        raise Unsupported('unsupported atom or syntax')

    def convert(self):
        value = self.expression()
        if self.peek() is not None:
            raise Unsupported('ambiguous top-level over or trailing syntax')
        category = next((name for name in ('fraction', 'radical', 'arithmetic', 'product')
                         if name in self.features), 'atom')
        return {'latex': value, 'category': category, 'features': sorted(self.features)}


def convert(source):
    source = source.strip()
    roman = re.fullmatch(r'rm\s+([A-Za-z])', source)
    if roman:
        return {'latex': '\\mathrm{' + roman[1] + '}', 'category': 'roman-atom', 'features': ['roman']}
    return SimpleEquation(source).convert()


def saved_object(data, offset):
    obj = hwp.equation_object(data)
    if obj is None:
        return None
    obj['controlRecordOffset'] = offset
    if len(data) >= 36:
        margins = dict(zip(('left', 'right', 'top', 'bottom'), struct.unpack_from('<hhhh', data, 28)))
        obj['externalMarginsHwpunit'] = margins
        obj['externalMarginsPt'] = {key: value / 100 for key, value in margins.items()}
    return obj


def extract(path, output):
    output.mkdir(parents=True, exist_ok=True)
    accepted, rejected, binary_streams, source_count = [], Counter(), [], 0
    with hwp.olefile.OleFileIO(path) as compound:
        header = compound.openstream('FileHeader').read()
        if not header.startswith(b'HWP Document File') or len(header) < 40:
            raise ValueError('not a supported HWP5 file')
        flags = struct.unpack_from('<I', header, 36)[0]
        if flags & 6:
            raise ValueError('password/distribution-protected files are unsupported')
        def read(parts):
            data = compound.openstream(parts).read()
            return zlib.decompress(data, -15) if flags & 1 else data
        for parts in sorted(compound.listdir()):
            if parts[0] == 'BinData':
                # Embedded storage can override the file's compression flag.
                data = compound.openstream(parts).read()
                decoding = 'stored'
                if flags & 1:
                    try:
                        data = zlib.decompress(data, -15)
                        decoding = 'raw-deflate'
                    except zlib.error:
                        pass
                binary_streams.append({'stream': '/'.join(parts), 'bytes': len(data),
                                       'storageDecoding': decoding,
                                       'magicHex': data[:12].hex(),
                                       'type': 'PNG' if data.startswith(b'\x89PNG\r\n\x1a\n') else 'other'})
            if len(parts) != 2 or parts[0] != 'BodyText':
                continue
            ancestors = []
            for tag, level, data, offset in hwp.records(read(parts)):
                ancestors = [(depth, obj) for depth, obj in ancestors if depth < level]
                if tag == 71:
                    ancestors.append((level, saved_object(data, offset)))
                if tag != 88:
                    continue
                index = source_count
                source_count += 1
                reader = hwp.Reader(data)
                reader.number('I')
                script = reader.string()
                try:
                    converted = convert(script)
                except Unsupported as error:
                    rejected[str(error)] += 1
                    continue
                metadata = hwp.equation_record(data)
                metadata.update({'index': index, 'stream': '/'.join(parts), 'recordOffset': offset,
                                 'script': script, **converted,
                                 'savedObject': next((obj for _, obj in reversed(ancestors) if obj), None)})
                accepted.append(metadata)
        preview = None
        if compound.exists('PrvImage'):
            data = compound.openstream('PrvImage').read()
            preview = {'bytes': len(data), 'sha256': sha256(data).hexdigest(),
                       'type': 'PNG' if data.startswith(b'\x89PNG\r\n\x1a\n') else 'other'}
        streams = ['/'.join(parts) for parts in compound.listdir()]

    groups = {}
    for row in accepted:
        key = (row['script'], row['fontName'], row['fontSizeHwpunit'], row['baselineRaw'],
               json.dumps(row['savedObject'] and {k: v for k, v in row['savedObject'].items()
                         if k not in ('controlRecordOffset', 'zOrder', 'verticalOffsetRaw',
                                      'horizontalOffsetRaw')}, sort_keys=True))
        if key not in groups:
            groups[key] = {**row, 'occurrences': []}
        groups[key]['occurrences'].append({'index': row['index'], 'stream': row['stream'],
                                          'recordOffset': row['recordOffset']})
    cases = list(groups.values())
    for i, case in enumerate(cases):
        case['caseId'] = f'hwp-simple-{i + 1:04d}'
        case['occurrenceCount'] = len(case['occurrences'])
    result = {
        'source': {'path': str(path.resolve()), 'sha256': sha256(path.read_bytes()).hexdigest()},
        'equationCount': source_count, 'acceptedOccurrences': len(accepted),
        'uniqueCases': len(cases), 'rejectionReasons': dict(rejected),
        'categoryOccurrences': dict(Counter(row['category'] for row in accepted)),
        'matchingRules': [
            'Compare only this entire script with its entire saved object. Never assign the object box to an extracted subformula.',
            'Use the recorded font size and preserve variant cases when identical scripts have different saved dimensions.',
            'widthPt/heightPt are saved equation-object layout dimensions, not measured glyph ink bounds. Internal renderer padding and manual resizing are not identified by this metadata.',
            'External margins are separate fields and must not be subtracted from widthPt/heightPt as though they were internal padding.',
            'baselineRaw is retained verbatim; no conversion to an optical baseline or stroke gap is claimed.',
            'HWP lineMode means equation flow mode; it does not establish LaTeX displaystyle versus textstyle.',
            'The syntax subset preserves mathematical grouping but has not independently established Hancom spacing or font metrics.',
            'No original matching PDF or fresh Hancom rendering is supplied by this extraction.',
        ],
        'binaryStreams': binary_streams, 'compoundStreams': streams, 'embeddedPreview': preview,
        'cases': cases,
    }
    (output / 'cases.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    summary = {key: value for key, value in result.items() if key != 'cases'}
    summary['radicalCases'] = [case for case in cases if 'radical' in case['features']]
    (output / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: value for key, value in summary.items()
                      if key not in ('radicalCases', 'compoundStreams', 'binaryStreams', 'matchingRules')},
                     ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path('artifacts/hwp-math-reference'))
    args = parser.parse_args()
    extract(args.source, args.output)


if __name__ == '__main__':
    main()
