"""Reads WooCommerce orders and customers out of a phpMyAdmin .sql.gz export
(HPOS tables) into one JSON file. Read-only on the dump.

Usage: python -I extract_woo_orders.py <dump.sql.gz> <out.json>
"""
import gzip
import json
import re
import sys

TABLES = {
    'wp_wc_orders', 'wp_wc_order_addresses', 'wp_woocommerce_order_items',
    'wp_woocommerce_order_itemmeta', 'wp_wc_customer_lookup', 'wp_wc_orders_meta',
    'wp_wc_order_operational_data',
}


def parse_values(text):
    """Tuples of a VALUES list: strings (with backslash escapes), numbers, NULL."""
    rows, row, i, n = [], None, 0, len(text)
    esc = {'n': '\n', 'r': '\r', 't': '\t', '0': '\0', 'Z': '\x1a'}
    while i < n:
        c = text[i]
        if c == '(' and row is None:
            row = []
            i += 1
        elif row is not None and c == "'":
            i += 1
            buf = []
            while i < n:
                ch = text[i]
                if ch == '\\' and i + 1 < n:
                    buf.append(esc.get(text[i + 1], text[i + 1]))
                    i += 2
                elif ch == "'" and i + 1 < n and text[i + 1] == "'":
                    buf.append("'")
                    i += 2
                elif ch == "'":
                    i += 1
                    break
                else:
                    buf.append(ch)
                    i += 1
            row.append(''.join(buf))
        elif row is not None and c == ')':
            rows.append(row)
            row = None
            i += 1
        elif row is not None and c not in ', \n\r\t':
            j = i
            while j < n and text[j] not in ',)':
                j += 1
            tok = text[i:j].strip()
            row.append(None if tok.upper() == 'NULL' else tok)
            i = j
        else:
            i += 1
    return rows


def read_dump(path):
    data = {t: {'cols': None, 'rows': []} for t in TABLES}
    cur, cols, insert = None, [], None
    with gzip.open(path, 'rt', encoding='utf-8', errors='replace') as fh:
        for line in fh:
            m = re.match(r"CREATE TABLE `([^`]+)`", line)
            if m:
                cur = m.group(1) if m.group(1) in TABLES else None
                cols = []
                continue
            if cur:
                c = re.match(r"\s+`([^`]+)`", line)
                if c:
                    cols.append(c.group(1))
                if line.startswith(')'):
                    data[cur]['cols'] = cols
                    cur = None
                continue
            m = re.match(r"INSERT INTO `([^`]+)`", line)
            if m and m.group(1) in TABLES:
                insert = [m.group(1), []]
                rest = line.split('VALUES', 1)[1] if 'VALUES' in line else ''
                insert[1].append(rest)
                if rest.rstrip().endswith(';'):
                    data[insert[0]]['rows'].extend(parse_values(''.join(insert[1])))
                    insert = None
                continue
            if insert:
                insert[1].append(line)
                if line.rstrip().endswith(');'):
                    data[insert[0]]['rows'].extend(parse_values(''.join(insert[1])))
                    insert = None
    out = {}
    for t, d in data.items():
        out[t] = [dict(zip(d['cols'] or [], r)) for r in d['rows']]
    return out


def main():
    d = read_dump(sys.argv[1])
    addresses = {}
    for a in d['wp_wc_order_addresses']:
        addresses.setdefault(a['order_id'], {})[a['address_type']] = {
            k: a.get(k) or '' for k in ('first_name', 'last_name', 'address_1', 'address_2', 'city', 'state', 'postcode', 'country', 'email', 'phone')
        }
    item_meta = {}
    for m in d['wp_woocommerce_order_itemmeta']:
        item_meta.setdefault(m['order_item_id'], {})[m['meta_key']] = m['meta_value']
    items = {}
    for it in d['wp_woocommerce_order_items']:
        meta = item_meta.get(it['order_item_id'], {})
        items.setdefault(it['order_id'], []).append({
            'type': it['order_item_type'],
            'name': it['order_item_name'],
            'productId': meta.get('_product_id'),
            'variationId': meta.get('_variation_id'),
            'qty': meta.get('_qty'),
            'lineTotal': meta.get('_line_total'),
            'lineSubtotal': meta.get('_line_subtotal'),
            'cost': meta.get('cost'),
            'discount': meta.get('discount_amount'),
            # Variation attributes are stored as item meta like pa_size / size / color.
            'attrs': {k: v for k, v in meta.items() if not k.startswith('_') and k not in ('cost', 'discount_amount', 'discount_amount_tax', 'method_id', 'instance_id', 'total_tax', 'taxes', 'Items', 'coupon_info')},
        })
    order_meta = {}
    for m in d['wp_wc_orders_meta']:
        if m['meta_key'] in ('_order_number', '_billing_phone', 'is_vat_exempt', '_razorpay_order_id', '_order_number_formatted'):
            order_meta.setdefault(m['order_id'], {})[m['meta_key']] = m['meta_value']
    op = {o['order_id']: o for o in d['wp_wc_order_operational_data']}

    orders = []
    for o in d['wp_wc_orders']:
        if o['type'] != 'shop_order':
            continue
        oid = o['id']
        opd = op.get(oid, {})
        orders.append({
            'id': int(oid),
            'status': o['status'],
            'currency': o['currency'],
            'total': o['total_amount'],
            'tax': o['tax_amount'],
            'customerId': o['customer_id'],
            'email': o['billing_email'] or '',
            'createdAtGmt': o['date_created_gmt'],
            'updatedAtGmt': o['date_updated_gmt'],
            'paymentMethod': o['payment_method'] or '',
            'paymentMethodTitle': o['payment_method_title'] or '',
            'transactionId': o['transaction_id'] or '',
            'customerNote': o['customer_note'] or '',
            'datePaidGmt': opd.get('date_paid_gmt'),
            'dateCompletedGmt': opd.get('date_completed_gmt'),
            'shippingTotal': opd.get('shipping_total_amount'),
            'discountTotal': opd.get('discount_total_amount'),
            'billing': addresses.get(oid, {}).get('billing', {}),
            'shipping': addresses.get(oid, {}).get('shipping', {}),
            'items': items.get(oid, []),
            'meta': order_meta.get(oid, {}),
        })
    refunds = [{'id': int(o['id']), 'parent': o['parent_order_id'], 'total': o['total_amount'], 'createdAtGmt': o['date_created_gmt']}
               for o in d['wp_wc_orders'] if o['type'] == 'shop_order_refund']
    customers = [{k: c.get(k) or '' for k in ('customer_id', 'user_id', 'first_name', 'last_name', 'email', 'date_registered', 'date_last_active', 'city', 'state', 'postcode', 'country')}
                 for c in d['wp_wc_customer_lookup']]
    json.dump({'orders': orders, 'refunds': refunds, 'customers': customers}, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    statuses = {}
    for o in orders:
        statuses[o['status']] = statuses.get(o['status'], 0) + 1
    print(json.dumps({'orders': len(orders), 'refunds': len(refunds), 'customers': len(customers), 'statuses': statuses,
                      'payment': sorted({o['paymentMethod'] for o in orders}),
                      'itemTypes': sorted({i['type'] for o in orders for i in o['items']}),
                      'attrKeys': sorted({k for o in orders for i in o['items'] for k in i['attrs']})}))


main()
