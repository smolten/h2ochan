# Apache Configuration Fix for Bible Verse Redirects

## Problem

The `/Gen/4/1` style URLs return 404 errors because your Apache configuration has:

```apache
AllowOverride None
```

This **completely disables .htaccess files**, so the rewrite rules in `.htaccess` are never applied.

## Solution

You have two options:

### Option 1: Enable .htaccess (Quick Fix)

Change `AllowOverride None` to `AllowOverride FileInfo` in both VirtualHost sections:

```apache
<Directory /var/www/html/h2ochan>
    Options -Indexes
    AllowOverride FileInfo  # Changed from None
    Require all granted
</Directory>
```

Then restart Apache:
```bash
sudo systemctl restart apache2
```

### Option 2: Move Rules to Apache Config (Better Performance)

Instead of using .htaccess, move the rewrite rules directly into your Apache configuration. This is more efficient because Apache doesn't have to check for .htaccess files on every request.

**Replace** `/etc/apache2/sites-available/h2ochan-le-ssl.conf` with the content from `/tmp/h2ochan-le-ssl.conf` (created by Claude).

Key changes:
- Rewrite rules moved from .htaccess into `<Directory>` block
- `AllowOverride None` remains (better security & performance)
- Security headers added to Apache config

Then:
```bash
# Test the configuration
sudo apache2ctl configtest

# If OK, restart Apache
sudo systemctl restart apache2
```

## Testing

After applying either fix, test these URLs:
- https://h2ochan.org/Gen/1/4 → should redirect to https://h2ochan.org/Gen/res/1.html#v4
- https://h2ochan.org/Gen/4/1 → should redirect to https://h2ochan.org/Gen/res/4.html#v1
- https://h2ochan.org/Gen/50/26 → should redirect to https://h2ochan.org/Gen/res/50.html#v26

## Recommendation

**Option 2 is recommended** because:
- Better performance (no .htaccess lookups)
- Better security (AllowOverride None)
- Easier to manage (all config in one place)
- The updated config file includes security headers from your .htaccess
